import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import fs from "fs";
import os from "os";
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
  addToCart, clearCart, createInvite, createLocalUser, deleteTrack,
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
} from "./db";
import { eq, and, or, isNull } from "drizzle-orm";
import { tracks as tracksTable, trackTags as trackTagsTable, taxonomyTags as taxonomyTagsTable } from "../drizzle/schema";
import { storagePut, storageGetSignedUrl } from "./storage";
import { downloadToTemp, generateWatermarkedMp3, generateWaveformPeaks, extractWavFromZip, convert16BitWav } from "./watermark";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const adminOnly = adminProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

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
        const user = await getUserById_local(userId);
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const token = await signJwt({ openId: user.openId, id: user.id });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
        return { success: true, user };
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
      .input(z.object({ origin: z.string(), role: z.enum(["user", "admin"]).default("user") }))
      .mutation(async ({ ctx, input }) => {
        const token = nanoid(32);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days
        await createInvite(token, ctx.user.id, expiresAt, input.role);
        const url = `${input.origin}/register?token=${token}`;
        return { token, url, expiresAt, role: input.role };
      }),
    list: adminOnly.query(async () => {
      return getAllInvites();
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
        const [allTagRows, downloadCounts] = await Promise.all([
          getTagsForTracks(allTracks.map(t => t.id)),
          getTrackDownloadCounts(),
        ]);

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

    // Admin: upload WAV file for a track
    uploadWav: adminOnly
      .input(z.object({
        id: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        mimeType: z.string().default("audio/wav"),
      }))
      .mutation(async ({ input }) => {
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `tracks/${input.id}/mixdown_${Date.now()}.wav`;
        const { url } = await storagePut(key, buf, input.mimeType);
        await updateTrack(input.id, { wavKey: key, wavUrl: url, watermarkStatus: "pending" });
        return { success: true, url };
      }),

    // Admin: upload stems ZIP
    uploadStems: adminOnly
      .input(z.object({
        id: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
      }))
      .mutation(async ({ input }) => {
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `tracks/${input.id}/stems_${Date.now()}.zip`;
        const { url } = await storagePut(key, buf, "application/zip");
        await updateTrack(input.id, { stemsZipKey: key, stemsZipUrl: url, hasStems: true });
        return { success: true, url };
      }),

    // Admin: upload cover art
    uploadCoverArt: adminOnly
      .input(z.object({
        id: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        mimeType: z.string().default("image/jpeg"),
      }))
      .mutation(async ({ input }) => {
        const buf = Buffer.from(input.fileBase64, "base64");
        const key = `tracks/${input.id}/cover_${Date.now()}`;
        const { url } = await storagePut(key, buf, input.mimeType);
        await updateTrack(input.id, { coverArtKey: key, coverArtUrl: url });
        return { success: true, url };
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
        // IMPORTANT: wavKey in DB is the pre-hash key; the actual S3 object uses the hashed key
        // embedded in wavUrl (e.g. /manus-storage/tracks/wav/..._ed4cd96d.wav).
        // Derive the real key from wavUrl so the signed URL request succeeds.
        const realWavKey = track.wavUrl
          ? track.wavUrl.replace(/^\/manus-storage\//, "")
          : track.wavKey!;
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
            // If the stored file is a ZIP (Dropbox bundle), extract the WAV and re-upload
            const rawBuf = fs.readFileSync(cleanPath);
            const zipResult = await extractWavFromZip(rawBuf);
            if (zipResult) {
              console.log(`[Watermark] Track ${trackId}: ZIP detected — extracting WAV from bundle`);
              fs.writeFileSync(cleanPath, zipResult.wavBuffer);
              const cleanKeyBase = `tracks/${trackId}/wav/clean_${Date.now()}.wav`;
              const { key: newWavKey, url: newWavUrl } = await storagePut(cleanKeyBase, zipResult.wavBuffer, "audio/wav");
              const stemsUpdate: Record<string, unknown> = { wavKey: newWavKey, wavUrl: newWavUrl };
              if (zipResult.stemsZipBuffer) {
                const stemsKeyBase = `tracks/${trackId}/stems/stems_${Date.now()}.zip`;
                const { key: sKey, url: sUrl } = await storagePut(stemsKeyBase, zipResult.stemsZipBuffer, "application/zip");
                stemsUpdate.stemsZipKey = sKey;
                stemsUpdate.stemsZipUrl = sUrl;
              }
              await updateTrack(trackId, stemsUpdate);
            }
            // Convert WAV to 16-bit PCM so WaveSurfer can decode it (24-bit/32-bit WAV not supported)
            const rawWavBuf = fs.readFileSync(cleanPath);
            const convertedWavBuf = await convert16BitWav(rawWavBuf);
            if (convertedWavBuf !== rawWavBuf) {
              // Re-upload the converted WAV so the browser player gets the 16-bit version
              const convKeyBase = `tracks/${trackId}/wav/clean_16bit_${Date.now()}.wav`;
              const { key: convKey, url: convUrl } = await storagePut(convKeyBase, convertedWavBuf, "audio/wav");
              await updateTrack(trackId, { wavKey: convKey, wavUrl: convUrl });
              fs.writeFileSync(cleanPath, convertedWavBuf);
            }
            // Generate waveform peaks from the 16-bit WAV
            const wavBuf = fs.readFileSync(cleanPath);
            const peaks = await generateWaveformPeaks(wavBuf);
            if (peaks) await updateTrack(trackId, { waveformPeaks: peaks });
            const wmSignedUrl = await storageGetSignedUrl(wmAudioKey);
            wmPath = await downloadToTemp(wmSignedUrl, ".wav");
            outPath = await generateWatermarkedMp3(cleanPath, wmPath);
            const mp3Buf = fs.readFileSync(outPath);
            const keyBase = `tracks/${trackId}/watermarked_${Date.now()}.mp3`;
            const { key: mp3Key, url: mp3Url } = await storagePut(keyBase, mp3Buf, "audio/mpeg");
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

        // Process tracks SEQUENTIALLY in background to avoid rate-limiting the storage API.
        // A 500ms gap between tracks keeps requests well under the 429 threshold.
        (async () => {
          for (const track of eligible) {
            const trackId = track.id;
            const realWavKey = track.wavUrl
              ? track.wavUrl.replace(/^\/manus-storage\//, "")
              : track.wavKey!;
            let cleanPath: string | null = null;
            let wmPath: string | null = null;
            let outPath: string | null = null;
            try {
              await updateTrack(trackId, { watermarkStatus: "processing" });
              const cleanSignedUrl = await storageGetSignedUrl(realWavKey);
              cleanPath = await downloadToTemp(cleanSignedUrl, ".wav");
              // If the stored file is a ZIP (Dropbox bundle), extract the WAV and re-upload
              const rawBuf = fs.readFileSync(cleanPath);
              const zipResult = await extractWavFromZip(rawBuf);
              if (zipResult) {
                console.log(`[Watermark] Track ${trackId}: ZIP detected — extracting WAV from bundle`);
                fs.writeFileSync(cleanPath, zipResult.wavBuffer);
                const cleanKeyBase = `tracks/${trackId}/wav/clean_${Date.now()}.wav`;
                const { key: newWavKey, url: newWavUrl } = await storagePut(cleanKeyBase, zipResult.wavBuffer, "audio/wav");
                const stemsUpdate: Record<string, unknown> = { wavKey: newWavKey, wavUrl: newWavUrl };
                if (zipResult.stemsZipBuffer) {
                  const stemsKeyBase = `tracks/${trackId}/stems/stems_${Date.now()}.zip`;
                  const { key: sKey, url: sUrl } = await storagePut(stemsKeyBase, zipResult.stemsZipBuffer, "application/zip");
                  stemsUpdate.stemsZipKey = sKey;
                  stemsUpdate.stemsZipUrl = sUrl;
                }
                await updateTrack(trackId, stemsUpdate);
              }
              // Convert WAV to 16-bit PCM so WaveSurfer can decode it (24-bit/32-bit WAV not supported)
              const rawWavBuf = fs.readFileSync(cleanPath);
              const convertedWavBuf = await convert16BitWav(rawWavBuf);
              if (convertedWavBuf !== rawWavBuf) {
                const convKeyBase = `tracks/${trackId}/wav/clean_16bit_${Date.now()}.wav`;
                const { key: convKey, url: convUrl } = await storagePut(convKeyBase, convertedWavBuf, "audio/wav");
                await updateTrack(trackId, { wavKey: convKey, wavUrl: convUrl });
                fs.writeFileSync(cleanPath, convertedWavBuf);
              }
              // Generate waveform peaks from the 16-bit WAV
              const wavBuf = fs.readFileSync(cleanPath);
              const peaks = await generateWaveformPeaks(wavBuf);
              if (peaks) await updateTrack(trackId, { waveformPeaks: peaks });
              const wmSignedUrl = await storageGetSignedUrl(wmAudioKey);
              wmPath = await downloadToTemp(wmSignedUrl, ".wav");
              outPath = await generateWatermarkedMp3(cleanPath, wmPath);
              const mp3Buf = fs.readFileSync(outPath);
              const keyBase = `tracks/${trackId}/watermarked_${Date.now()}.mp3`;
              const { key: mp3Key, url: mp3Url } = await storagePut(keyBase, mp3Buf, "audio/mpeg");
              await updateTrack(trackId, { watermarkedMp3Key: mp3Key, watermarkedMp3Url: mp3Url, watermarkStatus: "done" });
              console.log(`[Watermark] Retry done for track ${trackId}`);
            } catch (err) {
              console.error(`[Watermark] Retry failed for track ${trackId}:`, err);
              await updateTrack(trackId, { watermarkStatus: "error" }).catch(() => {});
            } finally {
              if (cleanPath && fs.existsSync(cleanPath)) fs.unlinkSync(cleanPath);
              if (wmPath && fs.existsSync(wmPath)) fs.unlinkSync(wmPath);
              if (outPath && fs.existsSync(outPath)) fs.unlinkSync(outPath);
            }
            // Brief pause between tracks to avoid 429 rate limiting on storage API
            await new Promise((r) => setTimeout(r, 500));
          }
          console.log(`[Watermark] Sequential retry complete for ${eligible.length} tracks`);
        })();

        return { count: eligible.length, message: `Queued watermark generation for ${eligible.length} track(s)` };
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
    // Admin: bulk import tracks from CSV rows (downloads WAV from URL, uploads to storage, queues watermark)
    bulkImport: adminOnly
      .input(z.object({
        rows: z.array(z.object({
          title: z.string(),
          composerName: z.string().optional(),
          description: z.string().optional(),
          bpm: z.number().optional(),
          keySignature: z.string().optional(),
          genres: z.array(z.string()).default([]),
          moods: z.array(z.string()).default([]),
          attributes: z.array(z.string()).default([]),
          hiddenTags: z.array(z.string()).default([]),
          wavUrl: z.string().url(),
          isPublished: z.boolean().default(true),
        })),
      }))
      .mutation(async ({ input }) => {
        const results: { title: string; status: "success" | "skipped" | "error"; trackId?: number; error?: string }[] = [];
        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        for (const row of input.rows) {
          try {
            // Check for duplicate title
            const existing = await dbConn.select({ id: tracksTable.id }).from(tracksTable).where(eq(tracksTable.title, row.title)).limit(1);
            if (existing.length > 0) {
              results.push({ title: row.title, status: "skipped", error: "Duplicate title" });
              continue;
            }
            // Convert Dropbox share URL to direct download URL
            let downloadUrl = row.wavUrl;
            if (downloadUrl.includes("dropbox.com")) {
              downloadUrl = downloadUrl
                .replace(/[?&]dl=0/, "")
                .replace(/[?&]raw=0/, "")
                .replace(/dropbox\.com\//, "dropbox.com/")
                + (downloadUrl.includes("?") ? "&dl=1" : "?dl=1");
            }
            // Download WAV file
            const response = await fetch(downloadUrl, { redirect: "follow" });
            if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
            const contentType = response.headers.get("content-type") ?? "audio/wav";
            const arrayBuffer = await response.arrayBuffer();
            const wavBuffer = Buffer.from(arrayBuffer);
            const safeTitle = row.title.replace(/[^a-zA-Z0-9_-]/g, "_");
            // Get duration via ffprobe
            let durationSeconds: number | undefined;
            try {
              const tmpWavPath = path.join(os.tmpdir(), `import_dur_${Date.now()}.wav`);
              fs.writeFileSync(tmpWavPath, wavBuffer);
              const { execFile } = await import("child_process");
              const { promisify } = await import("util");
              const execFileAsync = promisify(execFile);
              const { stdout } = await execFileAsync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",tmpWavPath]);
              durationSeconds = Math.round(parseFloat(stdout.trim()));
              fs.unlinkSync(tmpWavPath);
            } catch { /* non-critical */ }
            // Upload WAV to storage
            const wavKey = `tracks/wav/${Date.now()}_${safeTitle}.wav`;
            const { url: wavStorageUrl } = await storagePut(wavKey, wavBuffer, "audio/wav");
            // Generate waveform peaks (non-critical)
            const waveformPeaks = await generateWaveformPeaks(wavBuffer).catch(() => null);
            // Create track record
            const trackId = await createTrack({
              title: row.title,
              composerName: row.composerName,
              description: row.description,
              bpm: row.bpm,
              durationSeconds,
              wavKey,
              wavUrl: wavStorageUrl,
              hasStems: false,
              isPublished: row.isPublished,
              watermarkStatus: "pending",
              waveformPeaks: waveformPeaks ?? undefined,
            });
            // Save tags (keySignature stored as hidden tag)
            const tags = [
              ...row.genres.map(v => ({ type: "genre" as const, value: v })),
              ...row.moods.map(v => ({ type: "mood" as const, value: v })),
              ...row.attributes.map(v => ({ type: "attribute" as const, value: v })),
              ...row.hiddenTags.map(v => ({ type: "hidden" as const, value: v })),
              ...(row.keySignature ? [{ type: "hidden" as const, value: `key:${row.keySignature}` }] : []),
            ];
            if (tags.length > 0) await replaceTrackTags(trackId, tags);
            // Kick off watermark generation in background (non-blocking)
            (async () => {
              try {
                const wmConfig = await getWatermarkConfig();
                if (!wmConfig?.audioKey) {
                  await updateTrack(trackId, { watermarkStatus: "error" }).catch(() => {});
                  return;
                }
                await updateTrack(trackId, { watermarkStatus: "processing" });
                const wmSignedUrl = await storageGetSignedUrl(wmConfig.audioKey);
                const wmTmpPath = await downloadToTemp(wmSignedUrl, ".wav");
                const tmpWavPath2 = path.join(os.tmpdir(), `import_clean_${trackId}_${Date.now()}.wav`);
                fs.writeFileSync(tmpWavPath2, wavBuffer);
                const mp3TmpPath = await generateWatermarkedMp3(tmpWavPath2, wmTmpPath);
                const mp3Buffer = fs.readFileSync(mp3TmpPath);
                const mp3Key = `tracks/watermarked/${trackId}_${Date.now()}.mp3`;
                const { key: mp3Key2, url: mp3Url } = await storagePut(mp3Key, mp3Buffer, "audio/mpeg");
                await updateTrack(trackId, { watermarkedMp3Key: mp3Key2, watermarkedMp3Url: mp3Url, watermarkStatus: "done" });
                fs.unlinkSync(tmpWavPath2); fs.unlinkSync(wmTmpPath); fs.unlinkSync(mp3TmpPath);
              } catch { await updateTrack(trackId, { watermarkStatus: "error" }).catch(() => {}); }
            })();
            results.push({ title: row.title, status: "success", trackId });
          } catch (err: any) {
            results.push({ title: row.title, status: "error", error: err.message ?? "Unknown error" });
          }
        }
        return { results };
      }),
    // Admin: backfill waveform peaks for all tracks that don't have them yet
    backfillPeaks: adminOnly
      .mutation(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Get all tracks missing peaks
        const missing = await db
          .select({ id: tracksTable.id, wavUrl: tracksTable.wavUrl, wavKey: tracksTable.wavKey })
          .from(tracksTable)
          .where(isNull(tracksTable.waveformPeaks));
        let done = 0;
        let failed = 0;
        // Process in background — fire and forget, return count immediately
        (async () => {
          for (const track of missing) {
            try {
              if (!track.wavUrl) { failed++; continue; }
              // Derive the real key from wavUrl
              const realKey = track.wavUrl.replace(/^\/manus-storage\//, "");
              const signedUrl = await storageGetSignedUrl(realKey);
              const res = await fetch(signedUrl);
              if (!res.ok) { failed++; continue; }
              const buf = Buffer.from(await res.arrayBuffer());
              const peaks = await generateWaveformPeaks(buf);
              if (peaks) {
                await updateTrack(track.id, { waveformPeaks: peaks });
                done++;
              } else {
                failed++;
              }
            } catch {
              failed++;
            }
          }
          console.log(`[backfillPeaks] Done: ${done}, Failed: ${failed} of ${missing.length} tracks`);
        })();
        return { queued: missing.length };
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
        const results = [];
        for (const trackId of input.trackIds) {
          const track = await getTrackById(trackId);
          if (!track || !track.wavUrl) continue;
          await logDownload(ctx.user.id, trackId, input.projectName, "clean_wav");
          results.push({
            trackId,
            title: track.title,
            wavUrl: track.wavUrl,
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
        if (ctx.user) {
          await logDownload(ctx.user.id, input.trackId, "watermarked_preview", "watermarked_mp3");
        }
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
      .input(z.object({
        playlistId: z.number(),
        // Array of playlist-track IDs in the new desired order
        orderedIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Verify the playlist belongs to a project owned by this user
        const { playlistTracks: ptTable, playlists: playlistsTable, projects: projectsTable } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const pl = await db.select().from(playlistsTable).where(eq(playlistsTable.id, input.playlistId)).limit(1);
        if (!pl[0]) throw new TRPCError({ code: "NOT_FOUND" });
        const proj = await db.select().from(projectsTable).where(and(eq(projectsTable.id, pl[0].projectId), eq(projectsTable.userId, ctx.user.id))).limit(1);
        if (!proj[0]) throw new TRPCError({ code: "FORBIDDEN" });
        // Update sortOrder for each playlist-track row
        await Promise.all(input.orderedIds.map((ptId, idx) =>
          db.update(ptTable).set({ sortOrder: idx + 1 }).where(and(eq(ptTable.id, ptId), eq(ptTable.playlistId, input.playlistId)))
        ));
        return { success: true };
      }),
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
