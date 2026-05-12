export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Returns the local login page path.
 * Manus OAuth has been replaced with self-hosted email+password auth.
 */
export function getLoginUrl(_returnPath?: string): string {
  return "/login";
}
