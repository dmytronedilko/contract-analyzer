import type { Role } from '@repo/contracts';

/** The authenticated caller, set on the request by AuthGuard. Holds opaque ids only. */
export interface Principal {
  userId: string;
  sessionId: string;
  organizationId: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}
