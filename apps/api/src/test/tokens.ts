import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

export interface TokenOptions {
  sub?: string;
  sid?: string;
  org?: string | null;
  issuer?: string;
  audience?: string;
  /** Seconds relative to now; negative values produce an expired token. */
  expiresIn?: number;
  /** Sign with the ES256 key (also published in the JWKS) to test the algorithm allowlist. */
  algorithm?: 'EdDSA' | 'ES256';
  extraClaims?: JWTPayload;
}

/**
 * Signs test JWTs the way the web app's Better Auth JWT plugin does (EdDSA/Ed25519) and serves
 * the matching keys as a local JWKS, so tests never fetch a remote key set.
 */
export class TestTokens {
  private constructor(
    private readonly keys: Record<'EdDSA' | 'ES256', CryptoKey>,
    readonly jwks: JWTVerifyGetKey,
  ) {}

  static async create(): Promise<TestTokens> {
    const ed = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
    const es = await generateKeyPair('ES256');
    const jwks = createLocalJWKSet({
      keys: [
        { ...(await exportJWK(ed.publicKey)), kid: 'ed-key', alg: 'EdDSA' },
        { ...(await exportJWK(es.publicKey)), kid: 'es-key', alg: 'ES256' },
      ],
    });
    return new TestTokens({ EdDSA: ed.privateKey, ES256: es.privateKey }, jwks);
  }

  async sign(options: TokenOptions = {}): Promise<string> {
    const algorithm = options.algorithm ?? 'EdDSA';
    const now = Math.floor(Date.now() / 1000);
    const claims: JWTPayload = { sid: options.sid ?? 'session-1', ...options.extraClaims };
    if (options.org !== null) claims.org = options.org ?? 'org-1';

    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: algorithm, kid: algorithm === 'EdDSA' ? 'ed-key' : 'es-key' })
      .setIssuer(options.issuer ?? 'http://web.test')
      .setAudience(options.audience ?? 'legal-rag-api')
      .setIssuedAt(now - 1)
      .setExpirationTime(now + (options.expiresIn ?? 300));
    if (options.sub !== '') jwt.setSubject(options.sub ?? 'user-1');
    return jwt.sign(this.keys[algorithm]);
  }
}
