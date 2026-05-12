import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

/**
 * Sign a JWT session token for a local (non-OAuth) user.
 * Fully self-contained — no Manus SDK dependency.
 */
export async function signJwt(payload: { openId: string; id: number }): Promise<string> {
  const now = Date.now();
  const expSeconds = Math.floor((now + ONE_YEAR_MS) / 1000);
  return new SignJWT({ openId: payload.openId, id: payload.id })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expSeconds)
    .sign(getSecret());
}

/**
 * Verify a JWT session token.
 * Returns the decoded payload or null if invalid/expired.
 */
export async function verifyJwt(
  token: string | undefined | null
): Promise<{ openId: string; id: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const { openId, id } = payload as Record<string, unknown>;
    if (typeof openId !== "string" || !openId) return null;
    return { openId, id: Number(id) };
  } catch {
    return null;
  }
}
