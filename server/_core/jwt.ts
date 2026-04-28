import { sdk } from "./sdk";

/**
 * Sign a JWT session token for a local (non-OAuth) user.
 * Uses the same SDK signing mechanism so the session cookie is compatible
 * with the existing authenticateRequest flow.
 */
export async function signJwt(payload: { openId: string; id: number }): Promise<string> {
  return sdk.createSessionToken(payload.openId, { name: String(payload.id) });
}

/**
 * Verify a JWT session token.
 */
export async function verifyJwt(token: string) {
  return sdk.verifySession(token);
}
