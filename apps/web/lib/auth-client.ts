'use client';

import { jwtClient, organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { ac, roles } from './access-control';

/**
 * Browser client for Better Auth (same origin, /api/auth). Every identity provider, including the
 * generic OIDC one, signs in with signIn.social({ provider }).
 */
export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles }), jwtClient()],
});
