import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import fs from "fs";
import { nanoid } from "nanoid";
import path from "path";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { signJwt, verifyJwt } from "./_core/jwt";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  addToCart, clearCart, createInvite, createLocalUser, deleteInvite, deleteTrack,
  deleteUser, getAllDownloads, getAllInvites, getAllTracks, getAllUsers, getCartItems,
  getDb, getInviteByToken, getPublishedTracks, getTagsForTrack,
  getTagsForTracks, getTrackById, getUserByEmail, getUserByOpenId,
  getUserByResetToken, getUserByUsername, getWatermarkConfig, logDownload,
  markInviteUsed, removeFromCart, replaceTrackTags, setResetToken,
  updatePassword, updateTrack, upsertUser, upsertWatermarkConfig,
  getAllDistinctTagValues, createTrack,
  getQuarterlyDownloads, getYtdDownloads,
  getUserProjects, createProject, updateProject, deleteProject,
  getProjectByShareToken, getProjectById, getUserActiveProjects,
  getProjectPlaylists, createPlaylist, renamePlaylist, deletePlaylist,
  getPlaylistTracks, addTrackToPlaylist, removeTrackFromPlaylist,
  getTrackDownloadCounts,
  reorderPlaylistTracks,
  getUserDownloads,
  deleteDownloadEntry,
  deleteDownloadAdmin,
} from "./db";
import { eq, and, or } from "drizzle-orm";
import { tracks as tracksTable, trackTags as trackTagsTable, taxonomyTags as taxonomyTagsTable } from "../drizzle/schema";
import { storagePut, storageGetSignedUrl, storagePresignPut } from "./storage";
import { downloadToTemp, generateWatermarkedMp3, convert16BitWav, generateMp3Preview, generateWaveformPeaks } from "./watermark";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const adminOnly = adminProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

// Per-IP rate limit store for anonymous watermarked downloads
// Map<ip, timestamp[]> — timestamps of downloads within the rolling window
const anonDownloadRateLimit = new Map<string, number[]>();

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  // ─── Auth ──────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // Local login with username/email + password
    login: publicProcedure
      .input(z.object({ identifier: z.string(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const user = await getUserByEmail(input.identifier) ?? await getUserByUsername(input.identifier);
        if (!user || !user.passwordHash) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
        if (user.isLocked) throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been locked. Please contact an administrator." });
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
        await upsertUser({ openId: user.openId, lastSignedIn: new Date() });
        const token = await signJwt({ openId: user.openId, id: user.id });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
        return { success: true, user };
      }),

    // Update user preferences (e.g. skipWatermarkConfirm)
    updatePreference: protectedProcedure
      .input(z.object({ skipWatermarkConfirm: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        await upsertUser({ openId: ctx.user.openId, ...input });
        return { success: true };
      }),

    // Update user profile fields (firstName, lastName, company, jobTitle)
    updateProfile: protectedProcedure
      .input(z.object({
        firstName: z.string().min(1).max(128).optional(),
        lastName: z.string().min(1).max(128).optional(),
        company: z.string().max(256).optional(),
        jobTitle: z.string().max(128).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertUser({ openId: ctx.user.openId, ...input });
        return { success: true };
      }),

    // Get current user's clean download history
    myDownloads: protectedProcedure.query(async ({ ctx }) => {
      return getUserDownloads(ctx.user.id);
    }),



    // Change password (requires current password verification)
    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Password login is not set up for this account" });
        }
        const valid = await bcrypt.compare(input.currentPassword, ctx.user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
        }
        const newHash = await bcrypt.hash(input.newPassword, 12);
        await updatePassword(ctx.user.id, newHash);
        return { success: true };
      }),

    // Validate invite token
    validateInvite: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const invite = await getInviteByToken(input.token);
        if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite token" });
        if (invite.usedById) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite already used" });
        if (new Date() > invite.expiresAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has expired" });
        return { valid: true };
      }),

    // Register with invite
    register: publicProcedure
      .input(z.object({
        token: z.string(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email(),
        company: z.string().optional(),
        username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
        password: z.string().min(8),
      }))
      .mutation(async ({ input, ctx }) => {
        const invite = await getInviteByToken(input.token);
        if (!invite || invite.usedById || new Date() > invite.expiresAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired invite" });
        }
        const existingEmail = await getUserByEmail(input.email);
        if (existingEmail) throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
        const existingUsername = await getUserByUsername(input.username);
        if (existingUsername) throw new TRPCError({ code: "CONFLICT", message: "Username already taken" });
        const passwordHash = await bcrypt.hash(input.password, 12);
        const userId = await createLocalUser({
          firstName: input.firstName, lastName: input.lastName,
          email: input.email, company: input.company,
          username: input.username, passwordHash,
          role: invite.role as "user" | "admin",
        });
        const claimed = await markInviteUsed(input.token, userId);
        if (!claimed) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite already used" });
        // Fetch the newly created user — fall back to email lookup in case of
        // TiDB replication lag where insertId lookup returns undefined briefly.
        let user = await getUserById_local(userId);
        if (!user) {
          // Retry once after a short delay
          await new Promise(r => setTimeout(r, 300));
          user = await getUserById_local(userId);
        }
        if (!user) {
          // Final fallback: look up by email (guaranteed unique)
          user = await getUserByEmail(input.email);
        }
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account created but could not retrieve user — please try logging in." });
        const jwtToken = await signJwt({ openId: user.openId, id: user.id });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, jwtToken, cookieOptions);
        // Return only safe fields — never expose passwordHash
        return {
          success: true,
          user: {
            id: user.id,
            openId: user.openId,
            name: user.name,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            username: user.username,
          },
        };
      }),

    // Forgot password — generate reset token
    forgotPassword: publicProcedure
      .input(z.object({ email: z.string().email(), origin: z.string() }))
      .mutation(async ({ input }) => {
        const user = await getUserByEmail(input.email);
        if (!user) return { success: true }; // Don't reveal if email exists
        const token = nanoid(48);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
        await setResetToken(user.id, token, expiresAt);
        const resetUrl = `${input.origin}/reset-password?token=${token}`;
        // Send email via Resend
        if (ENV.resendApiKey) {
          try {
            const { Resend } = await import("resend");
            const resend = new Resend(ENV.resendApiKey);
            await resend.emails.send({
              from: ENV.resendFrom,
              to: input.email,
              subject: "Reset your Epipheo Music password",
              html: `
                <!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 16px;"><tr><td align="center">
                    <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
                      <tr><td style="background:#1a1a2e;padding:28px 36px;">
                        <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Epipheo <span style="color:#818cf8;">Music</span></p>
                      </td></tr>
                      <tr><td style="padding:40px 36px;">
                        <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#111827;">Reset your password</h1>
                        <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.65;">We received a request to reset the password for your Epipheo Music account. Click the button below to choose a new password.</p>
                        <a href="${resetUrl}" style="display:inline-block;background:#6366f1;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:0.1px;">Reset Password</a>
                        <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email &#8212; your password will remain unchanged.</p>
                      </td></tr>
                      <tr><td style="background:#f9fafb;padding:20px 36px;border-top:1px solid #e5e7eb;">
                        <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Epipheo Music &middot; This is an automated message, please do not reply.</p>
                      </td></tr>
                    </table>
                  </td></tr></table>
                </body></html>
              `,
            });
          } catch (e) {
            console.error("[Resend] Failed to send reset email:", e);
          }
        } else {
          console.log(`[Password Reset] Token for ${input.email}: ${token}`);
        }
        return { success: true };
      }),

    // Reset password with token
    resetPassword: publicProcedure
      .input(z.object({ token: z.string(), password: z.string().min(8) }))
      .mutation(async ({ input, ctx }) => {
        const user = await getUserByResetToken(input.token);
        if (!user || !user.resetTokenExpiresAt || new Date() > user.resetTokenExpiresAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired reset token" });
        }
        const passwordHash = await bcrypt.hash(input.password, 12);
        await updatePassword(user.id, passwordHash);
        const jwtToken = await signJwt({ openId: user.openId, id: user.id });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, jwtToken, cookieOptions);
        return { success: true };
      }),
  }),

  // ─── Invites ───────────────────────────────────────────────────────────────
  invites: router({
    create: adminOnly
      .input(z.object({
        origin: z.string(),
        role: z.enum(["user", "admin"]).default("user"),
        email: z.string().email().optional(), // if provided, send invite email directly
      }))
      .mutation(async ({ ctx, input }) => {
        const token = nanoid(32);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days
        await createInvite(token, ctx.user.id, expiresAt, input.role, input.email);
        const url = `${input.origin}/register?token=${token}`;

        // Optionally send invite email
        if (input.email && ENV.resendApiKey) {
          try {
            const { Resend } = await import("resend");
            const resend = new Resend(ENV.resendApiKey);
            const senderName = ctx.user.firstName
              ? `${ctx.user.firstName}${ctx.user.lastName ? " " + ctx.user.lastName : ""}`
              : ctx.user.name ?? "The Epipheo Music team";
            await resend.emails.send({
              from: ENV.resendFrom,
              to: input.email,
              subject: "You've been invited to Epipheo Music",
              html: `
                <!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 16px;"><tr><td align="center">
                    <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
                      <tr><td style="background:#1a1a2e;padding:28px 36px;">
                        <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Epipheo <span style="color:#818cf8;">Music</span></p>
                      </td></tr>
                      <tr><td style="padding:40px 36px;">
                        <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#111827;">You've been invited</h1>
                        <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.65;">${senderName} has invited you to join <strong>Epipheo Music</strong> — a private library of original music for Epipheo projects. Click the button below to create your account.</p>
                        <a href="${url}" style="display:inline-block;background:#6366f1;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:0.1px;">Accept Invitation</a>
                        <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">This invitation expires in <strong>7 days</strong>. If you weren't expecting this, you can safely ignore this email.</p>
                      </td></tr>
                      <tr><td style="background:#f9fafb;padding:20px 36px;border-top:1px solid #e5e7eb;">
                        <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Epipheo Music &middot; This is an automated message, please do not reply.</p>
                      </td></tr>
                    </table>
                  </td></tr></table>
                </body></html>
              `,
            });
          } catch (e) {
            console.error("[Resend] Failed to send invite email:", e);
          }
        } else if (input.email) {
          console.log(`[Invite] Email for ${input.email}: ${url}`);
        }

        return { token, url, expiresAt, role: input.role, emailSent: !!input.email };
      }),
    list: adminOnly.query(async () => {
      return getAllInvites();
    }),

    resendEmail: adminOnly
      .input(z.object({ inviteId: z.number(), origin: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Fetch invite directly from DB by ID
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { invites: invitesTable } = await import("../drizzle/schema");
        const rows = await db.select().from(invitesTable).where(eq(invitesTable.id, input.inviteId)).limit(1);
        const inv = rows[0];
        if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
        if (inv.usedById) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has already been used" });
        if (new Date() > inv.expiresAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has expired" });
        if (!inv.email) throw new TRPCError({ code: "BAD_REQUEST", message: "No email address on this invite" });
        const url = `${input.origin}/register?token=${inv.token}`;
        const senderName = ctx.user.firstName ? `${ctx.user.firstName} ${ctx.user.lastName ?? ""}`.trim() : "An Epipheo admin";
        if (!ENV.resendApiKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Email service not configured" });
        const { Resend } = await import("resend");
        const resend = new Resend(ENV.resendApiKey);
        await resend.emails.send({
          from: ENV.resendFrom,
          to: inv.email,
          subject: "You've been invited to Epipheo Music",
          html: `
            <!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 16px;"><tr><td align="center">
                <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
                  <tr><td style="background:#1a1a2e;padding:28px 36px;">
                    <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Epipheo <span style="color:#818cf8;">Music</span></p>
                  </td></tr>
                  <tr><td style="padding:40px 36px;">
                    <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#111827;">You've been invited</h1>
                    <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.65;">${senderName} has invited you to join <strong>Epipheo Music</strong> — a private library of original music for Epipheo projects. Click the button below to create your account.</p>
                    <a href="${url}" style="display:inline-block;background:#6366f1;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:0.1px;">Accept Invitation</a>
                    <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">This invitation expires on <strong>${new Date(inv.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>. If you weren't expecting this, you can safely ignore this email.</p>
                  </td></tr>
                  <tr><td style="background:#f9fafb;padding:20px 36px;border-top:1px solid #e5e7eb;">
                    <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Epipheo Music &middot; This is an automated message, please do not reply.</p>
                  </td></tr>
                </table>
              </td></tr></table>
            </body></html>
          `,
        });
        return { success: true };
      }),

    delete: adminOnly
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        // Fetch invite to check it hasn't been used
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { invites: invitesTable } = await import("../drizzle/schema");
        const rows = await db.select().from(invitesTable).where(eq(invitesTable.id, input.id)).limit(1);
        const inv = rows[0];
        if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
        if (inv.usedById) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete an invite that has already been used" });
        await deleteInvite(input.id);
        return { success: true };
      }),
  }),
  // ─── Tracks ────────────────────────────────────────────────────────────────────────────
  tracks: router({
    // Public: list published tracks with optional filters
    list: publicProcedure
      .input(z.object({
        search: z.string().optional(),
        genres: z.array(z.string()).optional(),
        moods: z.array(z.string()).optional(),
        attributes: z.array(z.string()).optional(),
        composerName: z.string().optional(),
        maxDuration: z.number().optional(),
        minDuration: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        const allTracks = await getPublishedTracks();
        if (!allTracks.length) return [];
        const allTagRows = await getTagsForTracks(allTracks.map(t => t.id));

        // Group tags by trackId
        const tagMap = new Map<number, { genres: string[]; moods: string[]; attributes: string[]; hidden: string[] }>();
        for (const tag of allTagRows) {
          if (!tagMap.has(tag.trackId)) tagMap.set(tag.trackId, { genres: [], moods: [], attributes: [], hidden: [] });
          const entry = tagMap.get(tag.trackId)!;
          if (tag.type === "genre") entry.genres.push(tag.value.toLowerCase());
          else if (tag.type === "mood") entry.moods.push(tag.value.toLowerCase());
          else if (tag.type === "attribute") entry.attributes.push(tag.value.toLowerCase());
          else if (tag.type === "hidden") entry.hidden.push(tag.value.toLowerCase());
        }

        const filtered = allTracks.filter(track => {
          const tags = tagMap.get(track.id) ?? { genres: [], moods: [], attributes: [], hidden: [] };
          if (input?.search) {
            // Split on commas — every term must match at least one field.
            // Tag matching is exact (whole tag equals the trimmed term, case-insensitive).
            // Title/composer matching allows substring so users can still search by name.
            const terms = input.search.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
            const allTagValues = [...tags.genres, ...tags.moods, ...tags.attributes, ...tags.hidden];
            const everyTermMatches = terms.every(term => {
              // Exact tag match (case-insensitive)
              const matchesTag = allTagValues.some(v => v === term);
              // Substring match against title or composer (allows name searches)
              const matchesTitle = track.title.toLowerCase().includes(term);
              const matchesComposer = track.composerName?.toLowerCase().includes(term) ?? false;
              return matchesTag || matchesTitle || matchesComposer;
            });
            if (!everyTermMatches) return false;
          }
          if (input?.genres?.length) {
            const lc = input.genres.map(g => g.toLowerCase());
            if (!lc.every(g => tags.genres.includes(g))) return false;
          }
          if (input?.moods?.length) {
            const lc = input.moods.map(m => m.toLowerCase());
            if (!lc.every(m => tags.moods.includes(m))) return false;
          }
          if (input?.attributes?.length) {
            const lc = input.attributes.map(a => a.toLowerCase());
            if (!lc.every(a => tags.attributes.includes(a))) return false;
          }
          if (input?.composerName) {
            if (!track.composerName?.toLowerCase().includes(input.composerName.toLowerCase())) return false;
          }
          if (input?.minDuration !== undefined && track.durationSeconds !== null && track.durationSeconds !== undefined) {
            if (track.durationSeconds < input.minDuration) return false;
          }
          if (input?.maxDuration !== undefined && track.durationSeconds !== null && track.durationSeconds !== undefined) {
            if (track.durationSeconds > input.maxDuration) return false;
          }
          return true;
        });

        const downloadCounts = await getTrackDownloadCounts();
        return filtered.map(track => ({
          ...track,
          // Don't expose hidden tags to the public
          tags: (() => { const t = tagMap.get(track.id); return { genres: t?.genres ?? [], moods: t?.moods ?? [], attributes: t?.attributes ?? [] }; })(),
          downloadCount: downloadCounts.get(track.id) ?? 0,
        }));
      }),

    // Public: get single track
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const track = await getTrackById(input.id);
        if (!track || !track.isPublished) throw new TRPCError({ code: "NOT_FOUND" });
        const tags = await getTagsForTrack(track.id);
        return { ...track, tags };
      }),

    // Public: get all tag values for filter UI (from admin-managed taxonomy_tags table)
    filterOptions: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { genres: [], moods: [], attributes: [] };
      const rows = await db.select().from(taxonomyTagsTable);
      const genres: string[] = [];
      const moods: string[] = [];
      const attributes: string[] = [];
      for (const row of rows) {
        if (row.type === "genre") genres.push(row.value);
        else if (row.type === "mood") moods.push(row.value);
        else if (row.type === "attribute") attributes.push(row.value);
      }
      return { genres: genres.sort(), moods: moods.sort(), attributes: attributes.sort() };
    }),

    // Admin: list all tracks
    adminList: adminOnly.query(async () => {
      const allTracks = await getAllTracks();
      if (!allTracks.length) return [];
      const [allTagRows, downloadCounts] = await Promise.all([
        getTagsForTracks(allTracks.map(t => t.id)),
        getTrackDownloadCounts(),
      ]);
      const tagMap = new Map<number, { genres: string[]; moods: string[]; attributes: string[]; hidden: string[] }>();
      for (const tag of allTagRows) {
        if (!tagMap.has(tag.trackId)) tagMap.set(tag.trackId, { genres: [], moods: [], attributes: [], hidden: [] });
        const entry = tagMap.get(tag.trackId)!;
        if (tag.type === "genre") entry.genres.push(tag.value);
        else if (tag.type === "mood") entry.moods.push(tag.value);
        else if (tag.type === "attribute") entry.attributes.push(tag.value);
        else if (tag.type === "hidden") entry.hidden.push(tag.value);
      }
      return allTracks.map(t => ({
        ...t,
        tags: tagMap.get(t.id) ?? { genres: [], moods: [], attributes: [], hidden: [] },
        downloadCount: downloadCounts.get(t.id) ?? 0,
      }));
    }),

    // Admin: create track (metadata only, files uploaded separately)
    create: adminOnly
      .input(z.object({
        title: z.string().min(1),
        composerName: z.string().optional(),
        description: z.string().optional(),
        durationSeconds: z.number().optional(),
        bpm: z.number().optional(),
        genres: z.array(z.string()).default([]),
        moods: z.array(z.string()).default([]),
        attributes: z.array(z.string()).default([]),
        hiddenTags: z.array(z.string()).default([]),
      }))
      .mutation(async ({ input }) => {
        // Duplicate title check
        const dbConn = await getDb();
        if (dbConn) {
          const existing = await dbConn.select({ id: tracksTable.id }).from(tracksTable).where(eq(tracksTable.title, input.title)).limit(1);
          if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: `A track named "${input.title}" already exists.` });
        }
        const id = await createTrack({
          title: input.title,
          composerName: input.composerName,
          description: input.description,
          durationSeconds: input.durationSeconds,
          bpm: input.bpm,
          isPublished: false,
          watermarkStatus: "pending",
          hasStems: false,
        });
        const tags = [
          ...input.genres.map(v => ({ type: "genre" as const, value: v })),
          ...input.moods.map(v => ({ type: "mood" as const, value: v })),
          ...input.attributes.map(v => ({ type: "attribute" as const, value: v })),
          ...input.hiddenTags.map(v => ({ type: "hidden" as const, value: v })),
        ];
        await replaceTrackTags(id, tags);
        return { id };
      }),

    // Admin: update track metadata
    update: adminOnly
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        composerName: z.string().optional(),
        description: z.string().optional(),
        durationSeconds: z.number().optional(),
        bpm: z.number().optional(),
        isPublished: z.boolean().optional(),
        genres: z.array(z.string()).optional(),
        moods: z.array(z.string()).optional(),
        attributes: z.array(z.string()).optional(),
        hiddenTags: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, genres, moods, attributes, hiddenTags, ...data } = input;
        await updateTrack(id, data);
        if (genres !== undefined || moods !== undefined || attributes !== undefined || hiddenTags !== undefined) {
          const tags = [
            ...(genres ?? []).map(v => ({ type: "genre" as const, value: v })),
            ...(moods ?? []).map(v => ({ type: "mood" as const, value: v })),
            ...(attributes ?? []).map(v => ({ type: "attribute" as const, value: v })),
            ...(hiddenTags ?? []).map(v => ({ type: "hidden" as const, value: v })),
          ];
          await replaceTrackTags(id, tags);
        }
        return { success: true };
      }),

    // Admin: delete track
    delete: adminOnly
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteTrack(input.id);
        return { success: true };
      }),

    // Admin: get a presigned PUT URL for direct browser-to-S3 upload (bypasses Railway 180s timeout)
    presignUpload: adminOnly
      .input(z.object({
        trackId: z.number(),
        fileType: z.enum(["wav", "stems", "cover"]),
        mimeType: z.string(),
        fileName: z.string(),
      }))
      .mutation(async ({ input }) => {
        const ext = input.fileName.split(".").pop() ?? "bin";
        const prefix = input.fileType === "wav" ? "mixdown" : input.fileType === "stems" ? "stems" : "cover";
        const relKey = `tracks/${input.trackId}/${prefix}_${Date.now()}.${ext}`;
        // Normalize MIME type for known file types to avoid R2 signature mismatch.
        // R2 requires the Content-Type in the PUT request to exactly match the signed URL.
        // Browser file.type can be empty or inconsistent for zip/wav files.
        const normalizedMime =
          input.fileType === "stems" ? "application/zip" :
          input.fileType === "wav" ? "audio/wav" :
          input.fileType === "cover" ? (input.mimeType || "image/jpeg") :
          (input.mimeType || "application/octet-stream");
        const { uploadUrl, key, publicUrl } = await storagePresignPut(relKey, normalizedMime, 3600);
        return { uploadUrl, key, publicUrl, normalizedMime };
      }),

    // Admin: confirm upload after browser has PUT the file directly to S3
    confirmUpload: adminOnly
      .input(z.object({
        trackId: z.number(),
        fileType: z.enum(["wav", "stems", "cover"]),
        key: z.string(),
        publicUrl: z.string(),
        durationSeconds: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.fileType === "wav") {
          await updateTrack(input.trackId, {
            wavKey: input.key,
            wavUrl: input.publicUrl,
            watermarkStatus: "pending",
            ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
          });
        } else if (input.fileType === "stems") {
          await updateTrack(input.trackId, {
            stemsZipKey: input.key,
            stemsZipUrl: input.publicUrl,
            hasStems: true,
          });
        } else if (input.fileType === "cover") {
          await updateTrack(input.trackId, {
            coverArtKey: input.key,
            coverArtUrl: input.publicUrl,
          });
        }
        return { success: true };
      }),

    // Admin: trigger watermark generation for a track
    generateWatermark: adminOnly
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const track = await getTrackById(input.id);
        if (!track) throw new TRPCError({ code: "NOT_FOUND" });
        if (!track.wavKey) throw new TRPCError({ code: "BAD_REQUEST", message: "No WAV file uploaded yet" });
        const wmConfig = await getWatermarkConfig();
        if (!wmConfig?.audioKey) throw new TRPCError({ code: "BAD_REQUEST", message: "No watermark audio configured" });

        await updateTrack(input.id, { watermarkStatus: "processing" });

        // Run async — don't block the response
        // Use wavKey directly — it is the actual S3 object key stored in the DB.
        // Do NOT derive from wavUrl: with direct-to-S3 uploads wavUrl is a full R2 public URL,
        // not a /manus-storage/ path, so stripping that prefix gives the wrong key.
        const realWavKey = track.wavKey!;
        const wmAudioKey = wmConfig.audioKey!;
        const trackId = input.id;
        (async () => {
          let cleanPath: string | null = null;
          let wmPath: string | null = null;
          let outPath: string | null = null;
          try {
            // Use signed URLs for server-side downloads — relative /manus-storage/ paths only work in the browser
            const cleanSignedUrl = await storageGetSignedUrl(realWavKey);
            cleanPath = await downloadToTemp(cleanSignedUrl, ".wav");

            // Preserve the original (possibly 24-bit) WAV for download before converting.
            // Only save originalWavUrl if not already set (avoid overwriting with 16-bit version).
            const currentTrack = await getTrackById(trackId);
            if (!currentTrack?.originalWavUrl) {
              const origBuf = fs.readFileSync(cleanPath);
              const origKey = `tracks/${trackId}/original_${Date.now()}.wav`;
              const { key: ok, url: ou } = await storagePut(origKey, origBuf, "audio/wav");
              await updateTrack(trackId, { originalWavKey: ok, originalWavUrl: ou });
            }

            // Convert to 16-bit WAV for browser playback (WebAudio cannot decode 24-bit in most browsers)
            const wav16Buf = await convert16BitWav(cleanPath);
            const conv16Key = `tracks/${trackId}/wav_16bit_${Date.now()}.wav`;
            const { key: convKey, url: convUrl } = await storagePut(conv16Key, wav16Buf, "audio/wav");
            await updateTrack(trackId, { wavKey: convKey, wavUrl: convUrl });
            // Generate 192kbps MP3 preview for fast browser streaming (from original 24-bit for best quality)
            try {
              const mp3PrevBuf = await generateMp3Preview(cleanPath);
              const mp3PrevKey = `tracks/${trackId}/mp3preview_${Date.now()}.mp3`;
              const { key: ppk, url: ppu } = await storagePut(mp3PrevKey, mp3PrevBuf, "audio/mpeg");
              await updateTrack(trackId, { mp3PreviewKey: ppk, mp3PreviewUrl: ppu });
            } catch (e) { console.error(`[Watermark] MP3 preview failed for track ${trackId}:`, e); }
            // Generate RMS waveform peaks for visual display (from original 24-bit WAV for best accuracy)
            try {
              const peaksJson = await generateWaveformPeaks(cleanPath);
              await updateTrack(trackId, { waveformPeaks: peaksJson });
              console.log(`[Watermark] Waveform peaks generated for track ${trackId}`);
            } catch (e) { console.error(`[Watermark] Waveform peaks failed for track ${trackId}:`, e); }
            // Re-download the 16-bit version for watermarking
            cleanPath && fs.existsSync(cleanPath) && fs.unlinkSync(cleanPath);
            const conv16SignedUrl = await storageGetSignedUrl(convKey);
            cleanPath = await downloadToTemp(conv16SignedUrl, ".wav");

            const wmSignedUrl = await storageGetSignedUrl(wmAudioKey);
            wmPath = await downloadToTemp(wmSignedUrl, ".wav");
            outPath = await generateWatermarkedMp3(cleanPath, wmPath);
            const buf = fs.readFileSync(outPath);
            const keyBase = `tracks/${trackId}/watermarked_${Date.now()}.mp3`;
            const { key: mp3Key, url: mp3Url } = await storagePut(keyBase, buf, "audio/mpeg");
            await updateTrack(trackId, { watermarkedMp3Key: mp3Key, watermarkedMp3Url: mp3Url, watermarkStatus: "done" });
            console.log(`[Watermark] Done for track ${trackId}: ${mp3Url}`);
          } catch (err) {
            console.error("[Watermark] Failed:", err);
            await updateTrack(trackId, { watermarkStatus: "error" });
          } finally {
            if (cleanPath && fs.existsSync(cleanPath)) fs.unlinkSync(cleanPath);
            if (wmPath && fs.existsSync(wmPath)) fs.unlinkSync(wmPath);
            if (outPath && fs.existsSync(outPath)) fs.unlinkSync(outPath);
          }
        })();

        return { success: true, message: "Watermark generation started" };
      }),

    // Admin: retry watermark generation for ALL stuck tracks (pending or error)
    retryAllStuck: adminOnly
      .mutation(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const wmConfig = await getWatermarkConfig();
        if (!wmConfig?.audioKey) throw new TRPCError({ code: "BAD_REQUEST", message: "No watermark audio configured" });

        // Find all tracks with pending or error watermark status that have a WAV file
        const stuckTracks = await db
          .select()
          .from(tracksTable)
          .where(
            or(
              eq(tracksTable.watermarkStatus, "pending"),
              eq(tracksTable.watermarkStatus, "error")
            )
          );

        const eligible = stuckTracks.filter((t) => t.wavKey);
        if (eligible.length === 0) return { count: 0, message: "No stuck tracks found" };

        const wmAudioKey = wmConfig.audioKey!;

        // Mark all as processing, then kick off async watermark jobs
        for (const track of eligible) {
          await updateTrack(track.id, { watermarkStatus: "processing" });

          // Use wavKey directly (same reason as generateWatermark above)
          const realWavKey = track.wavKey!;
          const trackId = track.id;

          (async () => {
            let cleanPath: string | null = null;
            let wmPath: string | null = null;
            let outPath: string | null = null;
            try {
              const cleanSignedUrl = await storageGetSignedUrl(realWavKey);
              cleanPath = await downloadToTemp(cleanSignedUrl, ".wav");

              // Preserve original 24-bit WAV for download (only if not already saved)
              const currentTrack = await getTrackById(trackId);
              if (!currentTrack?.originalWavUrl) {
                const origBuf = fs.readFileSync(cleanPath);
                const origKey = `tracks/${trackId}/original_${Date.now()}.wav`;
                const { key: ok, url: ou } = await storagePut(origKey, origBuf, "audio/wav");
                await updateTrack(trackId, { originalWavKey: ok, originalWavUrl: ou });
              }

              // Convert to 16-bit WAV for browser playback
              const wav16Buf = await convert16BitWav(cleanPath);
              const conv16Key = `tracks/${trackId}/wav_16bit_${Date.now()}.wav`;
              const { key: convKey, url: convUrl } = await storagePut(conv16Key, wav16Buf, "audio/wav");
              await updateTrack(trackId, { wavKey: convKey, wavUrl: convUrl });
              // Generate 192kbps MP3 preview for fast browser streaming
              try {
                const mp3PrevBuf = await generateMp3Preview(cleanPath);
                const mp3PrevKey = `tracks/${trackId}/mp3preview_${Date.now()}.mp3`;
                const { key: ppk, url: ppu } = await storagePut(mp3PrevKey, mp3PrevBuf, "audio/mpeg");
                await updateTrack(trackId, { mp3PreviewKey: ppk, mp3PreviewUrl: ppu });
              } catch (e) { console.error(`[Watermark] Bulk MP3 preview failed for track ${trackId}:`, e); }
              // Re-download 16-bit for watermarking
              cleanPath && fs.existsSync(cleanPath) && fs.unlinkSync(cleanPath);
              const conv16SignedUrl = await storageGetSignedUrl(convKey);
              cleanPath = await downloadToTemp(conv16SignedUrl, ".wav");

              const wmSignedUrl = await storageGetSignedUrl(wmAudioKey);
              wmPath = await downloadToTemp(wmSignedUrl, ".wav");
              outPath = await generateWatermarkedMp3(cleanPath, wmPath);
              const buf = fs.readFileSync(outPath);
              const keyBase = `tracks/${trackId}/watermarked_${Date.now()}.mp3`;
              const { key: mp3Key, url: mp3Url } = await storagePut(keyBase, buf, "audio/mpeg");
              await updateTrack(trackId, { watermarkedMp3Key: mp3Key, watermarkedMp3Url: mp3Url, watermarkStatus: "done" });
              console.log(`[Watermark] Bulk retry done for track ${trackId}: ${mp3Url}`);
            } catch (err) {
              console.error(`[Watermark] Bulk retry failed for track ${trackId}:`, err);
              await updateTrack(trackId, { watermarkStatus: "error" });
            } finally {
              if (cleanPath && fs.existsSync(cleanPath)) fs.unlinkSync(cleanPath);
              if (wmPath && fs.existsSync(wmPath)) fs.unlinkSync(wmPath);
              if (outPath && fs.existsSync(outPath)) fs.unlinkSync(outPath);
            }
          })();
        }

        return { count: eligible.length, message: `Queued watermark generation for ${eligible.length} track(s)` };
      }),

    // Admin: regenerate waveform peaks for all tracks using the RMS algorithm.
    // Run this once after upgrading from peak-per-block to RMS to fix flat waveforms.
    regenerateAllPeaks: adminOnly
      .mutation(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const allTracks = await getAllTracks();
        const eligible = allTracks.filter(t => t.wavKey || t.mp3PreviewKey);
        if (eligible.length === 0) return { count: 0, message: "No tracks with audio found" };

        // Run async in background — returns immediately with count
        (async () => {
          let done = 0;
          for (const track of eligible) {
            let tmpPath: string | null = null;
            try {
              // Prefer original WAV for best quality peaks; fall back to mp3Preview
              const audioKey = track.wavKey ?? track.mp3PreviewKey;
              const ext = track.wavKey ? ".wav" : ".mp3";
              const signedUrl = await storageGetSignedUrl(audioKey!);
              tmpPath = await downloadToTemp(signedUrl, ext);
              const peaksJson = await generateWaveformPeaks(tmpPath);
              await updateTrack(track.id, { waveformPeaks: peaksJson });
              done++;
              if (done % 10 === 0) console.log(`[Peaks] Regenerated ${done}/${eligible.length}`);
            } catch (err) {
              console.error(`[Peaks] Failed for track ${track.id}:`, err);
            } finally {
              if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            }
          }
          console.log(`[Peaks] Done: regenerated ${done}/${eligible.length} tracks`);
        })();

        return { count: eligible.length, message: `Queued RMS peak regeneration for ${eligible.length} track(s) — runs in background` };
      }),

    // Admin: regenerate waveform peaks for a single track by ID
    regeneratePeaksForTrack: adminOnly
      .input(z.object({ trackId: z.number() }))
      .mutation(async ({ input }) => {
        const track = await getTrackById(input.trackId);
        if (!track) throw new TRPCError({ code: "NOT_FOUND", message: "Track not found" });
        const audioKey = track.wavKey ?? track.mp3PreviewKey;
        if (!audioKey) throw new TRPCError({ code: "BAD_REQUEST", message: "Track has no audio file" });
        const ext = track.wavKey ? ".wav" : ".mp3";
        let tmpPath: string | null = null;
        try {
          const signedUrl = await storageGetSignedUrl(audioKey);
          tmpPath = await downloadToTemp(signedUrl, ext);
          const peaksJson = await generateWaveformPeaks(tmpPath);
          await updateTrack(track.id, { waveformPeaks: peaksJson });
          console.log(`[Peaks] Regenerated peaks for track ${track.id} (${track.title})`);
          return { success: true, message: `Peaks regenerated for "${track.title}"` };
        } finally {
          if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        }
      }),

    // Admin: delete a global tag value from all tracks
    deleteGlobalTag: adminOnly
      .input(z.object({ type: z.enum(["genre", "mood", "attribute"]), value: z.string() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(trackTagsTable).where(
          and(eq(trackTagsTable.type, input.type), eq(trackTagsTable.value, input.value))
        );
        return { success: true };
      }),
    // Admin: get taxonomy tags (canonical list for Browse dropdowns)
    getTaxonomy: adminOnly.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(taxonomyTagsTable);
      const genres: string[] = [];
      const moods: string[] = [];
      const attributes: string[] = [];
      for (const r of rows) {
        if (r.type === "genre") genres.push(r.value);
        else if (r.type === "mood") moods.push(r.value);
        else if (r.type === "attribute") attributes.push(r.value);
      }
      return { genres: genres.sort(), moods: moods.sort(), attributes: attributes.sort() };
    }),
    // Admin: add a tag to the taxonomy
    addTaxonomyTag: adminOnly
      .input(z.object({ type: z.enum(["genre", "mood", "attribute"]), value: z.string().min(1).max(128) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Check for duplicate
        const existing = await db.select().from(taxonomyTagsTable)
          .where(and(eq(taxonomyTagsTable.type, input.type), eq(taxonomyTagsTable.value, input.value)));
        if (existing.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Tag already exists" });
        await db.insert(taxonomyTagsTable).values({ type: input.type, value: input.value });
        return { success: true };
      }),
    // Admin: remove a tag from the taxonomy (does NOT remove from existing tracks)
    removeTaxonomyTag: adminOnly
      .input(z.object({ type: z.enum(["genre", "mood", "attribute"]), value: z.string() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(taxonomyTagsTable).where(
          and(eq(taxonomyTagsTable.type, input.type), eq(taxonomyTagsTable.value, input.value))
        );
        return { success: true };
      }),
  }),
  // ─── Watermark Config ──────────────────────────────────────────────────────
  watermark: router({
    getConfig: adminOnly.query(async () => {
      return getWatermarkConfig();
    }),

    uploadConfig: adminOnly
      .input(z.object({
        fileName: z.string(),
        fileBase64: z.string(),
        mimeType: z.string().default("audio/wav"),
      }))
      .mutation(async ({ input }) => {
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `watermark/wm_${Date.now()}${path.extname(input.fileName)}`;
        const { url } = await storagePut(key, buf, input.mimeType);
        await upsertWatermarkConfig(key, url);
        return { success: true, url };
      }),
  }),

  // ─── Cart ──────────────────────────────────────────────────────────────────
  cart: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const items = await getCartItems(ctx.user.id);
      if (!items.length) return [];
      const trackDetails = await Promise.all(
        items.map(async (item) => {
          const track = await getTrackById(item.trackId);
          if (!track) return null;
          const tags = await getTagsForTrack(track.id);
          return { ...item, track: { ...track, tags } };
        })
      );
      return trackDetails.filter(Boolean);
    }),

    add: protectedProcedure
      .input(z.object({ trackId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await addToCart(ctx.user.id, input.trackId);
        return { success: true };
      }),

    remove: protectedProcedure
      .input(z.object({ trackId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await removeFromCart(ctx.user.id, input.trackId);
        return { success: true };
      }),

    clear: protectedProcedure.mutation(async ({ ctx }) => {
      await clearCart(ctx.user.id);
      return { success: true };
    }),
  }),

  // ─── Downloads ─────────────────────────────────────────────────────────────
  downloads: router({
    // Checkout: log downloads and return download URLs
    checkout: protectedProcedure
      .input(z.object({
        projectName: z.string().min(1),
        trackIds: z.array(z.number()).min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        // Block locked accounts from downloading clean tracks
        if (ctx.user.isLocked) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been locked. Please contact support." });
        }
        const results = [];
        for (const trackId of input.trackIds) {
          const track = await getTrackById(trackId);
          if (!track || !track.wavUrl) continue;
          await logDownload(ctx.user.id, trackId, input.projectName, "clean_wav");
          // Serve the original 24-bit WAV for download when available;
          // wavUrl may be the 16-bit browser-playback version.
          const downloadWavUrl = track.originalWavUrl ?? track.wavUrl;
          results.push({
            trackId,
            title: track.title,
            wavUrl: downloadWavUrl,
            stemsZipUrl: track.stemsZipUrl ?? null,
            hasStems: track.hasStems,
          });
        }
        await clearCart(ctx.user.id);
        return { success: true, files: results };
      }),

    // Public: download watermarked version (no login required, but log if logged in)
    downloadWatermarked: publicProcedure
      .input(z.object({ trackId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const track = await getTrackById(input.trackId);
        if (!track || !track.isPublished) throw new TRPCError({ code: "NOT_FOUND" });
        if (!track.watermarkedMp3Url) throw new TRPCError({ code: "BAD_REQUEST", message: "Watermarked version not available yet" });
        // Always log watermarked downloads — use userId if logged in, otherwise log IP
        const ip = (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
          ?? ctx.req.socket?.remoteAddress
          ?? "unknown";
        // Per-IP rate limit for anonymous users: max 10 watermarked downloads per rolling hour
        if (!ctx.user) {
          const now = Date.now();
          const windowMs = 60 * 60 * 1000; // 1 hour
          const limit = 10;
          const existing = anonDownloadRateLimit.get(ip) ?? [];
          const recent = existing.filter((t: number) => now - t < windowMs);
          if (recent.length >= limit) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: "You have reached the hourly limit for watermarked preview downloads. Please try again later or sign in for unlimited access.",
            });
          }
          recent.push(now);
          anonDownloadRateLimit.set(ip, recent);
        }
        await logDownload(
          ctx.user?.id ?? null,
          input.trackId,
          "watermarked_preview",
          "watermarked_mp3",
          ctx.user ? null : ip
        );
        return { url: track.watermarkedMp3Url, title: track.title };
      }),

    // Admin: view all download logs
    adminList: adminOnly.query(async () => {
      return getAllDownloads();
    }),
  }),

  // ─── Admin ─────────────────────────────────────────────────────────────────
  admin: router({
    users: adminOnly.query(async () => getAllUsers()),
    lockUser: adminOnly.input(z.object({ userId: z.number(), locked: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { users: usersTable } = await import("../drizzle/schema");
      await db.update(usersTable).set({ isLocked: input.locked }).where(eq(usersTable.id, input.userId));
      return { success: true };
    }),
    deleteUser: adminOnly
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Prevent admins from deleting their own account
        if (ctx.user.id === input.userId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot delete your own account" });
        }
        // Prevent deleting other admin accounts
        const target = await import("../drizzle/schema").then(async (schema) => {
          const db = await getDb();
          if (!db) return undefined;
          const result = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
          return result[0];
        });
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        if (target.role === "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete admin accounts" });
        }
        await deleteUser(input.userId);
        return { success: true };
      }),
    deleteDownload: adminOnly
      .input(z.object({ downloadId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteDownloadAdmin(input.downloadId);
        return { success: true };
      }),
    stats: adminOnly.query(async () => {
      const [allTracks, allUsers, quarterlyDownloads, ytdDownloads] = await Promise.all([
        getAllTracks(), getAllUsers(), getQuarterlyDownloads(), getYtdDownloads(),
      ]);
      return {
        totalTracks: allTracks.length,
        publishedTracks: allTracks.filter(t => t.isPublished).length,
        quarterlyDownloads,
        ytdDownloads,
        totalUsers: allUsers.length,
      };
    }),
  }),

  // ─── Projects Router ────────────────────────────────────────────────────────────────
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => getUserProjects(ctx.user.id)),
    listActive: protectedProcedure.query(async ({ ctx }) => getUserActiveProjects(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(256), description: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const shareToken = nanoid(16);
        const id = await createProject({ userId: ctx.user.id, name: input.name, description: input.description, shareToken });
        return { id, shareToken };
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(256).optional(), description: z.string().optional(), status: z.enum(["active", "archived"]).optional() }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await updateProject(id, ctx.user.id, data);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteProject(input.id, ctx.user.id);
        return { success: true };
      }),
    getByShareToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const project = await getProjectByShareToken(input.token);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        const pls = await getProjectPlaylists(project.id);
        const playlistsWithTracks = await Promise.all(pls.map(async pl => ({ ...pl, tracks: await getPlaylistTracks(pl.id) })));
        return { project, playlists: playlistsWithTracks };
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await getProjectById(input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const pls = await getProjectPlaylists(project.id);
        const playlistsWithTracks = await Promise.all(pls.map(async pl => ({ ...pl, tracks: await getPlaylistTracks(pl.id) })));
        return { project, playlists: playlistsWithTracks };
      }),
    createPlaylist: protectedProcedure
      .input(z.object({ projectId: z.number(), name: z.string().min(1).max(256) }))
      .mutation(async ({ ctx, input }) => {
        const project = await getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const id = await createPlaylist(input.projectId, input.name);
        return { id };
      }),
    renamePlaylist: protectedProcedure
      .input(z.object({ playlistId: z.number(), name: z.string().min(1).max(256) }))
      .mutation(async ({ input }) => { await renamePlaylist(input.playlistId, input.name); return { success: true }; }),
    deletePlaylist: protectedProcedure
      .input(z.object({ playlistId: z.number() }))
      .mutation(async ({ input }) => { await deletePlaylist(input.playlistId); return { success: true }; }),
    addTrack: protectedProcedure
      .input(z.object({ playlistId: z.number(), trackId: z.number() }))
      .mutation(async ({ input }) => { await addTrackToPlaylist(input.playlistId, input.trackId); return { success: true }; }),
    removeTrack: protectedProcedure
      .input(z.object({ playlistId: z.number(), trackId: z.number() }))
      .mutation(async ({ input }) => { await removeTrackFromPlaylist(input.playlistId, input.trackId); return { success: true }; }),
    reorderTracks: protectedProcedure
      .input(z.object({ playlistId: z.number(), orderedTrackIds: z.array(z.number()) }))
      .mutation(async ({ input }) => { await reorderPlaylistTracks(input.playlistId, input.orderedTrackIds); return { success: true }; }),
  }),
});

// Helper to get user by numeric ID (local helper)
async function getUserById_local(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { users: usersTable } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return result[0];
}

export type AppRouter = typeof appRouter;
