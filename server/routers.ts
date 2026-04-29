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
  addToCart, clearCart, createInvite, createLocalUser, deleteTrack,
  getAllDownloads, getAllInvites, getAllTracks, getAllUsers, getCartItems,
  getDb, getInviteByToken, getPublishedTracks, getTagsForTrack,
  getTagsForTracks, getTrackById, getUserByEmail, getUserByOpenId,
  getUserByResetToken, getUserByUsername, getWatermarkConfig, logDownload,
  markInviteUsed, removeFromCart, replaceTrackTags, setResetToken,
  updatePassword, updateTrack, upsertUser, upsertWatermarkConfig,
  getAllDistinctTagValues, createTrack,
} from "./db";
import { eq, and } from "drizzle-orm";
import { trackTags as trackTagsTable } from "../drizzle/schema";
import { storagePut, storageGetSignedUrl } from "./storage";
import { downloadToTemp, generateWatermarkedMp3 } from "./watermark";

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
        });
        await markInviteUsed(input.token, userId);
        const user = await getUserById_local(userId);
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const token = await signJwt({ openId: user.openId, id: user.id });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
        return { success: true, user };
      }),

    // Forgot password — generate reset token
    forgotPassword: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const user = await getUserByEmail(input.email);
        if (!user) return { success: true }; // Don't reveal if email exists
        const token = nanoid(48);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
        await setResetToken(user.id, token, expiresAt);
        // In production, send email. For now, return token for admin use.
        console.log(`[Password Reset] Token for ${input.email}: ${token}`);
        return { success: true, resetToken: token }; // Token returned for dev convenience
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
      .input(z.object({ origin: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const token = nanoid(32);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days
        await createInvite(token, ctx.user.id, expiresAt);
        const url = `${input.origin}/register?token=${token}`;
        return { token, url, expiresAt };
      }),

    list: adminOnly.query(async () => {
      return getAllInvites();
    }),
  }),

  // ─── Tracks ────────────────────────────────────────────────────────────────
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

        return filtered.map(track => ({
          ...track,
          // Don't expose hidden tags to the public
          tags: (() => { const t = tagMap.get(track.id); return { genres: t?.genres ?? [], moods: t?.moods ?? [], attributes: t?.attributes ?? [] }; })(),
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

    // Public: get all distinct tag values for filter UI
    filterOptions: publicProcedure.query(async () => {
      const rows = await getAllDistinctTagValues();
      const genres: string[] = [];
      const moods: string[] = [];
      const attributes: string[] = [];
      for (const row of rows) {
        if (row.type === "genre") genres.push(row.value);
        else if (row.type === "mood") moods.push(row.value);
        else if (row.type === "attribute") attributes.push(row.value);
      }
      return { genres, moods, attributes };
    }),

    // Admin: list all tracks
    adminList: adminOnly.query(async () => {
      const allTracks = await getAllTracks();
      if (!allTracks.length) return [];
      const allTagRows = await getTagsForTracks(allTracks.map(t => t.id));
      const tagMap = new Map<number, { genres: string[]; moods: string[]; attributes: string[]; hidden: string[] }>();
      for (const tag of allTagRows) {
        if (!tagMap.has(tag.trackId)) tagMap.set(tag.trackId, { genres: [], moods: [], attributes: [], hidden: [] });
        const entry = tagMap.get(tag.trackId)!;
        if (tag.type === "genre") entry.genres.push(tag.value);
        else if (tag.type === "mood") entry.moods.push(tag.value);
        else if (tag.type === "attribute") entry.attributes.push(tag.value);
        else if (tag.type === "hidden") entry.hidden.push(tag.value);
      }
      return allTracks.map(t => ({ ...t, tags: tagMap.get(t.id) ?? { genres: [], moods: [], attributes: [], hidden: [] } }));
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
    stats: adminOnly.query(async () => {
      const [allTracks, allDownloads, allUsers] = await Promise.all([
        getAllTracks(), getAllDownloads(), getAllUsers(),
      ]);
      return {
        totalTracks: allTracks.length,
        publishedTracks: allTracks.filter(t => t.isPublished).length,
        totalDownloads: allDownloads.length,
        totalUsers: allUsers.length,
      };
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
