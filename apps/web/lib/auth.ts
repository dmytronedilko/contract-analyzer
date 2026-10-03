import 'server-only';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { genericOAuth, jwt, organization } from 'better-auth/plugins';
import { and, count, desc, eq, isNotNull, like } from 'drizzle-orm';
import { z } from 'zod';

import { member, session as sessionTable, user as userTable } from '@repo/db';

import { ac, roles } from './access-control';
import { recordAuditEvent } from './audit';
import { db } from './db';
import { serverEnv, type ServerEnv } from './env';

const DAY = 24 * 60 * 60;

/** Provider id of the generic OIDC provider (Okta, Auth0, Keycloak, the local mock...). */
export const OIDC_PROVIDER_ID = 'oidc';

export interface IdentityProvider {
  /** Passed to authClient.signIn.social({ provider }); the callback is /api/auth/callback/<id>. */
  id: string;
  name: string;
}

/** The identity providers whose env vars are set; only these are enabled and shown. */
export function configuredProviders(env: ServerEnv = serverEnv()): IdentityProvider[] {
  const providers: IdentityProvider[] = [];
  if (env.AUTH_MICROSOFT_CLIENT_ID) {
    providers.push({ id: 'microsoft', name: 'Microsoft' });
  }
  if (env.AUTH_GOOGLE_CLIENT_ID) providers.push({ id: 'google', name: 'Google' });
  if (env.AUTH_OIDC_CLIENT_ID) {
    providers.push({ id: OIDC_PROVIDER_ID, name: env.AUTH_OIDC_NAME ?? 'SSO' });
  }
  return providers;
}

/** Mirrors allowUserToCreateOrganization, so the UI only offers what the server allows. */
export function canCreateOrganization(email: string, env: ServerEnv = serverEnv()): boolean {
  const creators = env.AUTH_ORG_CREATOR_EMAILS ?? [];
  return creators.length === 0 || creators.includes(email.toLowerCase());
}

/** Error codes shown on /sign-in (see app/(auth)/sign-in). */
export const SIGN_IN_ERRORS = {
  emailNotVerified: 'email_not_verified',
  domainNotAllowed: 'domain_not_allowed',
} as const;

/** The member an organization endpoint returned: the member itself, or wrapped in { member }. */
const MemberSchema = z.object({ organizationId: z.string(), userId: z.string(), role: z.string() });
const ChangedMemberSchema = z.union([z.object({ member: MemberSchema }), MemberSchema]);

/** The organization plugin's session field, which Better Auth's base session type doesn't declare. */
function activeOrganizationOf(session: object): string | null {
  return 'activeOrganizationId' in session && typeof session.activeOrganizationId === 'string'
    ? session.activeOrganizationId
    : null;
}

function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

/** Only verified emails, and only from AUTH_ALLOWED_EMAIL_DOMAINS when it is set. */
function assertAllowedUser(env: ServerEnv, user: { email: string; emailVerified: boolean }): void {
  if (!user.emailVerified) {
    throw new APIError('FORBIDDEN', {
      code: SIGN_IN_ERRORS.emailNotVerified,
      message: 'Your identity provider did not confirm your email address.',
    });
  }
  const allowed = env.AUTH_ALLOWED_EMAIL_DOMAINS;
  if (allowed?.length && !allowed.includes(emailDomain(user.email))) {
    throw new APIError('FORBIDDEN', {
      code: SIGN_IN_ERRORS.domainNotAllowed,
      message: 'Accounts from your email domain are not allowed.',
    });
  }
}

/**
 * The organization a new session starts in: the one the user was last active in (if they are
 * still a member), otherwise their most recently joined one, otherwise none (onboarding).
 */
async function initialOrganization(userId: string): Promise<string | null> {
  const memberships = await db()
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(desc(member.createdAt));
  if (!memberships.length) return null;

  const [last] = await db()
    .select({ organizationId: sessionTable.activeOrganizationId })
    .from(sessionTable)
    .where(and(eq(sessionTable.userId, userId), isNotNull(sessionTable.activeOrganizationId)))
    .orderBy(desc(sessionTable.updatedAt))
    .limit(1);
  const ids = new Set(memberships.map((m) => m.organizationId));
  if (last?.organizationId && ids.has(last.organizationId)) return last.organizationId;
  return memberships[0]!.organizationId;
}

/** The last owner can't leave, be removed or be demoted: an organization always has an owner. */
async function assertNotLastOwner(organizationId: string, memberRole: string): Promise<void> {
  if (!memberRole.split(',').includes('owner')) return;
  const [{ owners } = { owners: 0 }] = await db()
    .select({ owners: count() })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), like(member.role, '%owner%')));
  if (owners <= 1) {
    throw new APIError('BAD_REQUEST', {
      message: 'An organization must keep at least one owner. Make someone else an owner first.',
    });
  }
}

function createAuth(env: ServerEnv) {
  const socialProviders: BetterAuthOptions['socialProviders'] = {};
  if (env.AUTH_MICROSOFT_CLIENT_ID && env.AUTH_MICROSOFT_CLIENT_SECRET) {
    socialProviders.microsoft = {
      clientId: env.AUTH_MICROSOFT_CLIENT_ID,
      clientSecret: env.AUTH_MICROSOFT_CLIENT_SECRET,
      // A specific tenant, not "common", unless multi-tenant sign-in is intended.
      tenantId: env.AUTH_MICROSOFT_TENANT_ID,
      prompt: 'select_account',
    };
  }
  if (env.AUTH_GOOGLE_CLIENT_ID && env.AUTH_GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
      prompt: 'select_account',
    };
  }

  return betterAuth({
    appName: 'Contract Analyzer',
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: drizzleAdapter(db(), { provider: 'pg' }),
    telemetry: { enabled: false },

    // SSO only: no passwords, magic links or outgoing email.
    emailAndPassword: { enabled: false },
    socialProviders,
    account: {
      accountLinking: {
        // Accounts link automatically only when the provider has verified the email; no
        // provider is trusted to link unverified addresses.
        enabled: true,
        allowDifferentEmails: false,
      },
    },

    session: {
      expiresIn: env.AUTH_SESSION_TTL_HOURS * 60 * 60,
      updateAge: 60 * 60,
      // No cookie cache: revoking a session must take effect immediately.
      cookieCache: { enabled: false },
    },
    advanced: {
      // Secure, httpOnly, SameSite=Lax cookies with the __Secure- prefix in production.
      useSecureCookies: env.NODE_ENV === 'production',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    rateLimit: { enabled: true, storage: 'database' },
    // Sign-in failures (unverified email, disallowed domain, provider errors) land on /sign-in
    // with ?error=<code>, which shows a readable message.
    onAPIError: { errorURL: `${env.APP_URL}/sign-in` },

    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            assertAllowedUser(env, user);
            return { data: user };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const [user] = await db()
              .select({ email: userTable.email, emailVerified: userTable.emailVerified })
              .from(userTable)
              .where(eq(userTable.id, session.userId));
            if (!user) return false;
            assertAllowedUser(env, user);
            const activeOrganizationId = await initialOrganization(session.userId);
            return { data: { ...session, activeOrganizationId } };
          },
          after: async (session) => {
            const organizationId = activeOrganizationOf(session);
            if (!organizationId) return;
            await recordAuditEvent({
              action: 'auth.sign_in',
              organizationId,
              actorId: session.userId,
              targetType: 'session',
              targetId: session.id,
            });
          },
        },
      },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Sign-out is recorded before the session disappears.
        if (ctx.path !== '/sign-out' && ctx.path !== '/revoke-sessions') return;
        const current = await getSessionFromCtx(ctx);
        const organizationId = current?.session.activeOrganizationId;
        if (!current || !organizationId) return;
        await recordAuditEvent({
          action: 'auth.sign_out',
          organizationId,
          actorId: current.user.id,
          targetType: 'session',
          targetId: current.session.id,
          metadata: { allDevices: ctx.path === '/revoke-sessions' },
        });
      }),
      after: createAuthMiddleware(async (ctx) => {
        // Membership changes, recorded with the acting session (the organization hooks only
        // know the affected member).
        if (
          ctx.path !== '/organization/remove-member' &&
          ctx.path !== '/organization/leave' &&
          ctx.path !== '/organization/update-member-role'
        ) {
          return;
        }
        const parsed = ChangedMemberSchema.safeParse(ctx.context.returned);
        if (!parsed.success) return;
        const changed = 'member' in parsed.data ? parsed.data.member : parsed.data;
        const current = await getSessionFromCtx(ctx);
        await recordAuditEvent({
          action:
            ctx.path === '/organization/update-member-role'
              ? 'member.role_change'
              : 'member.remove',
          organizationId: changed.organizationId,
          actorId: current?.user.id ?? null,
          targetType: 'user',
          targetId: changed.userId,
          metadata:
            ctx.path === '/organization/update-member-role'
              ? { role: changed.role }
              : { self: current?.user.id === changed.userId },
        });
      }),
    },

    plugins: [
      organization({
        ac,
        roles,
        creatorRole: 'owner',
        allowUserToCreateOrganization: (user) => canCreateOrganization(user.email, env),
        invitationExpiresIn: 7 * DAY,
        // There is no email infrastructure: the UI shows a copyable invite link instead.
        sendInvitationEmail: async () => {},
        organizationHooks: {
          beforeRemoveMember: async ({ member: removed }) => {
            await assertNotLastOwner(removed.organizationId, removed.role);
          },
          beforeUpdateMemberRole: async ({ member: updated, newRole }) => {
            if (!newRole.split(',').includes('owner')) {
              await assertNotLastOwner(updated.organizationId, updated.role);
            }
          },
          afterCreateOrganization: async ({ organization: created, user }) => {
            await recordAuditEvent({
              action: 'organization.create',
              organizationId: created.id,
              actorId: user.id,
              targetType: 'organization',
              targetId: created.id,
            });
          },
          afterCreateInvitation: async ({ invitation, inviter }) => {
            await recordAuditEvent({
              action: 'invitation.create',
              organizationId: invitation.organizationId,
              actorId: inviter.id,
              targetType: 'invitation',
              targetId: invitation.id,
              metadata: { role: invitation.role },
            });
          },
          afterAcceptInvitation: async ({ invitation, user }) => {
            await recordAuditEvent({
              action: 'invitation.accept',
              organizationId: invitation.organizationId,
              actorId: user.id,
              targetType: 'invitation',
              targetId: invitation.id,
            });
          },
        },
      }),
      jwt({
        // The API's bearer token: 5 minutes, EdDSA, and no personal data.
        jwt: {
          issuer: env.APP_URL,
          audience: env.AUTH_AUDIENCE,
          expirationTime: '5m',
          definePayload: ({ session }) => ({
            sid: session.id,
            org: activeOrganizationOf(session),
          }),
        },
        jwks: {
          keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' },
          // Private keys stay encrypted in the jwks table (the default).
          rotationInterval: 90 * DAY,
          gracePeriod: 30 * DAY,
        },
        // Never hand API tokens to the browser: only the server-side proxy mints them.
        disableSettingJwtHeader: true,
      }),
      ...(env.AUTH_OIDC_ISSUER && env.AUTH_OIDC_CLIENT_ID
        ? [
            genericOAuth({
              config: [
                {
                  providerId: OIDC_PROVIDER_ID,
                  discoveryUrl: `${env.AUTH_OIDC_ISSUER.replace(/\/$/, '')}/.well-known/openid-configuration`,
                  clientId: env.AUTH_OIDC_CLIENT_ID,
                  clientSecret: env.AUTH_OIDC_CLIENT_SECRET,
                  scopes: ['openid', 'email', 'profile'],
                  pkce: true,
                },
              ],
            }),
          ]
        : []),
      // Must be last: lets server actions and route handlers set cookies.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

declare global {
  // Survives dev-mode hot reloads, so there is one Better Auth instance per server.
  var betterAuthInstance: Auth | undefined;
}

/** The Better Auth instance, created on first use so `next build` needs no runtime env. */
export function auth(): Auth {
  globalThis.betterAuthInstance ??= createAuth(serverEnv());
  return globalThis.betterAuthInstance;
}
