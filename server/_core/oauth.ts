import type { Express } from "express";

/**
 * OAuth routes stub — Manus OAuth has been replaced with self-hosted
 * email+password authentication. This file is kept as a no-op so the
 * import in server/_core/index.ts continues to resolve without error.
 */
export function registerOAuthRoutes(_app: Express) {
  // No-op: Manus OAuth removed. Auth is handled via tRPC auth.login procedure.
}
