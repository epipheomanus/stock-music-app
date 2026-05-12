import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  CartItem,
  Download,
  InsertTrack,
  InsertUser,
  Invite,
  Track,
  TrackTag,
  User,
  cartItems,
  downloads,
  invites,
  trackTags,
  tracks,
  users,
  watermarkConfig,
  projects,
  playlists,
  playlistTracks,
  Project,
  Playlist,
  PlaylistTrack,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod", "firstName", "lastName", "company", "jobTitle", "username", "passwordHash"] as const;
  type TextField = typeof textFields[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.skipWatermarkConfirm !== undefined) { values.skipWatermarkConfirm = user.skipWatermarkConfirm; updateSet.skipWatermarkConfirm = user.skipWatermarkConfirm; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0];
}

export async function createLocalUser(data: {
  firstName: string; lastName: string; email: string;
  company?: string; username: string; passwordHash: string;
  role?: "user" | "admin";
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const openId = `local_${data.username}_${Date.now()}`;
  const result = await db.insert(users).values({
    openId, name: `${data.firstName} ${data.lastName}`,
    firstName: data.firstName, lastName: data.lastName,
    email: data.email, company: data.company ?? null,
    username: data.username, passwordHash: data.passwordHash,
    loginMethod: "local", role: data.role ?? "user", lastSignedIn: new Date(),
  });
  return (result as unknown as { insertId: number }).insertId;
}

export async function setResetToken(userId: number, token: string, expiresAt: Date): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ resetToken: token, resetTokenExpiresAt: expiresAt }).where(eq(users.id, userId));
}

export async function getUserByResetToken(token: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.resetToken, token)).limit(1);
  return result[0];
}

export async function updatePassword(userId: number, passwordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash, resetToken: null, resetTokenExpiresAt: null }).where(eq(users.id, userId));
}

export async function getAllUsers(): Promise<User[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

// ─── Invites ──────────────────────────────────────────────────────────────────

export async function createInvite(token: string, createdById: number, expiresAt: Date, role: "user" | "admin" = "user"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(invites).values({ token, createdById, expiresAt, role });
}

export async function getInviteByToken(token: string): Promise<Invite | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
  return result[0];
}

export async function markInviteUsed(token: string, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Atomic: only update if not yet used (prevents concurrent redemption)
  const result = await db.update(invites)
    .set({ usedById: userId, usedAt: new Date() })
    .where(and(eq(invites.token, token), isNull(invites.usedById)));
  const affectedRows = (result as unknown as { rowsAffected?: number; affectedRows?: number }).affectedRows
    ?? (result as unknown as { rowsAffected?: number }).rowsAffected ?? 1;
  return affectedRows > 0;
}

export async function getAllInvites(): Promise<Invite[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invites).orderBy(desc(invites.createdAt));
}

// ─── Tracks ───────────────────────────────────────────────────────────────────

export async function createTrack(data: InsertTrack): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tracks).values(data).$returningId();
  const id = result[0]?.id;
  if (!id) throw new Error("Failed to get inserted track ID");
  return id;
}

export async function updateTrack(id: number, data: Partial<InsertTrack>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tracks).set(data).where(eq(tracks.id, id));
}

export async function deleteTrack(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(trackTags).where(eq(trackTags.trackId, id));
  await db.delete(cartItems).where(eq(cartItems.trackId, id));
  await db.delete(tracks).where(eq(tracks.id, id));
}

export async function getTrackById(id: number): Promise<Track | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
  return result[0];
}

export async function getPublishedTracks(): Promise<Track[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tracks).where(eq(tracks.isPublished, true)).orderBy(desc(tracks.createdAt));
}

export async function getAllTracks(): Promise<Track[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tracks).orderBy(desc(tracks.createdAt));
}

// ─── Track Tags ───────────────────────────────────────────────────────────────

export async function addTrackTag(trackId: number, type: "genre" | "mood" | "attribute" | "hidden", value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(trackTags).values({ trackId, type, value });
}

export async function removeTrackTag(tagId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(trackTags).where(eq(trackTags.id, tagId));
}

export async function getTagsForTrack(trackId: number): Promise<TrackTag[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(trackTags).where(eq(trackTags.trackId, trackId));
}

export async function getTagsForTracks(trackIds: number[]): Promise<TrackTag[]> {
  if (trackIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  return db.select().from(trackTags).where(inArray(trackTags.trackId, trackIds));
}

export async function replaceTrackTags(trackId: number, tags: { type: "genre" | "mood" | "attribute" | "hidden"; value: string }[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(trackTags).where(eq(trackTags.trackId, trackId));
  if (tags.length > 0) {
    await db.insert(trackTags).values(tags.map(t => ({ trackId, type: t.type, value: t.value })));
  }
}

export async function getAllDistinctTagValues(): Promise<{ type: string; value: string }[]> {
  const db = await getDb();
  if (!db) return [];
  // Exclude hidden tags from the public filter options
  const { ne } = await import("drizzle-orm");
  return db.selectDistinct({ type: trackTags.type, value: trackTags.value }).from(trackTags).where(ne(trackTags.type, "hidden")).orderBy(trackTags.type, trackTags.value);
}

// ─── Cart ─────────────────────────────────────────────────────────────────────

export async function addToCart(userId: number, trackId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.trackId, trackId))).limit(1);
  if (existing.length === 0) {
    await db.insert(cartItems).values({ userId, trackId });
  }
}

export async function removeFromCart(userId: number, trackId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.trackId, trackId)));
}

export async function getCartItems(userId: number): Promise<CartItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cartItems).where(eq(cartItems.userId, userId));
}

export async function clearCart(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(cartItems).where(eq(cartItems.userId, userId));
}

// ─── Downloads ────────────────────────────────────────────────────────────────

export async function logDownload(userId: number, trackId: number, projectName: string, fileType: "clean_wav" | "watermarked_mp3"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(downloads).values({ userId, trackId, projectName, fileType });
}

export async function getAllDownloads(): Promise<(Download & { userName: string | null; userEmail: string | null; trackTitle: string })[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: downloads.id,
      userId: downloads.userId,
      trackId: downloads.trackId,
      projectName: downloads.projectName,
      downloadedAt: downloads.downloadedAt,
      fileType: downloads.fileType,
      userName: users.name,
      userEmail: users.email,
      trackTitle: tracks.title,
    })
    .from(downloads)
    .leftJoin(users, eq(downloads.userId, users.id))
    .leftJoin(tracks, eq(downloads.trackId, tracks.id))
    .orderBy(desc(downloads.downloadedAt));
  return rows as (Download & { userName: string | null; userEmail: string | null; trackTitle: string })[];
}

// ─── Watermark Config ─────────────────────────────────────────────────────────

export async function getWatermarkConfig() {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(watermarkConfig).limit(1);
  return result[0] ?? null;
}

export async function upsertWatermarkConfig(audioKey: string, audioUrl: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(watermarkConfig).limit(1);
  if (existing.length > 0) {
    await db.update(watermarkConfig).set({ audioKey, audioUrl });
  } else {
    await db.insert(watermarkConfig).values({ audioKey, audioUrl });
  }
}
// ─── Downloads Stats ────────────────────────────────────────────────────────────────
export async function getQuarterlyDownloads(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const quarterStart = new Date(year, Math.floor(month / 3) * 3, 1);
  const quarterEnd = new Date(year, Math.floor(month / 3) * 3 + 3, 1);
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(downloads)
    .where(and(
      eq(downloads.fileType, "clean_wav"),
      sql`${downloads.downloadedAt} >= ${quarterStart}`,
      sql`${downloads.downloadedAt} < ${quarterEnd}`
    ));
  return Number(rows[0]?.count ?? 0);
}
export async function getYtdDownloads(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(downloads)
    .where(and(
      eq(downloads.fileType, "clean_wav"),
      sql`${downloads.downloadedAt} >= ${yearStart}`
    ));
  return Number(rows[0]?.count ?? 0);
}

// ─── Projects ─────────────────────────────────────────────────────────────────
export async function getUserProjects(userId: number): Promise<Project[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
}
export async function createProject(data: { userId: number; name: string; description?: string; shareToken: string }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projects).values({ userId: data.userId, name: data.name, description: data.description, shareToken: data.shareToken });
  return (result[0] as any).insertId;
}
export async function updateProject(id: number, userId: number, data: { name?: string; description?: string; status?: "active" | "archived" }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(projects).set(data).where(and(eq(projects.id, id), eq(projects.userId, userId)));
}
export async function deleteProject(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const projectPlaylists = await db.select({ id: playlists.id }).from(playlists).where(eq(playlists.projectId, id));
  if (projectPlaylists.length > 0) {
    const playlistIds = projectPlaylists.map(p => p.id);
    await db.delete(playlistTracks).where(inArray(playlistTracks.playlistId, playlistIds));
    await db.delete(playlists).where(eq(playlists.projectId, id));
  }
  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
}
export async function getProjectByShareToken(token: string): Promise<Project | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(projects).where(eq(projects.shareToken, token)).limit(1);
  return rows[0] ?? null;
}
export async function getProjectById(id: number): Promise<Project | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function getUserActiveProjects(userId: number): Promise<(Project & { playlists: Playlist[] })[]> {
  const db = await getDb();
  if (!db) return [];
  const activeProjects = await db.select().from(projects).where(and(eq(projects.userId, userId), eq(projects.status, "active"))).orderBy(desc(projects.createdAt));
  const result: (Project & { playlists: Playlist[] })[] = [];
  for (const p of activeProjects) {
    const pls = await db.select().from(playlists).where(eq(playlists.projectId, p.id)).orderBy(playlists.createdAt);
    result.push({ ...p, playlists: pls });
  }
  return result;
}

// ─── Playlists ────────────────────────────────────────────────────────────────
export async function getProjectPlaylists(projectId: number): Promise<Playlist[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(playlists).where(eq(playlists.projectId, projectId)).orderBy(playlists.createdAt);
}
export async function createPlaylist(projectId: number, name: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(playlists).values({ projectId, name });
  return (result[0] as any).insertId;
}
export async function renamePlaylist(id: number, name: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(playlists).set({ name }).where(eq(playlists.id, id));
}
export async function deletePlaylist(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(playlistTracks).where(eq(playlistTracks.playlistId, id));
  await db.delete(playlists).where(eq(playlists.id, id));
}
export async function getPlaylistTracks(playlistId: number): Promise<(PlaylistTrack & { track: Track })[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(playlistTracks)
    .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
    .where(eq(playlistTracks.playlistId, playlistId))
    .orderBy(playlistTracks.sortOrder, playlistTracks.addedAt);
  return rows.map(r => ({ ...r.playlist_tracks, track: r.tracks }));
}
export async function addTrackToPlaylist(playlistId: number, trackId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(playlistTracks).where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId))).limit(1);
  if (existing.length > 0) return;
  const maxOrder = await db.select({ m: sql<number>`COALESCE(MAX(sortOrder),0)` }).from(playlistTracks).where(eq(playlistTracks.playlistId, playlistId));
  await db.insert(playlistTracks).values({ playlistId, trackId, sortOrder: Number(maxOrder[0]?.m ?? 0) + 1 });
}
export async function removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(playlistTracks).where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)));
}

// ─── User Downloads ──────────────────────────────────────────────────────────────────
export async function getUserDownloads(userId: number): Promise<(Download & { trackTitle: string; composerName: string | null; coverArtUrl: string | null })[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: downloads.id,
      userId: downloads.userId,
      trackId: downloads.trackId,
      projectName: downloads.projectName,
      downloadedAt: downloads.downloadedAt,
      fileType: downloads.fileType,
      trackTitle: tracks.title,
      composerName: tracks.composerName,
      coverArtUrl: tracks.coverArtUrl,
    })
    .from(downloads)
    .leftJoin(tracks, eq(downloads.trackId, tracks.id))
    .where(eq(downloads.userId, userId))
    .orderBy(desc(downloads.downloadedAt));
  return rows as (Download & { trackTitle: string; composerName: string | null; coverArtUrl: string | null })[];
}

// ─── User Management ────────────────────────────────────────────────────────────────
export async function deleteUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Remove dependent rows first, then the user
  await db.delete(cartItems).where(eq(cartItems.userId, userId));
  await db.delete(downloads).where(eq(downloads.userId, userId));
  // Preserve one-time-use semantics: invites already redeemed (usedAt is set) keep
  // their usedAt timestamp so they cannot be reused. We only null the FK so the
  // row doesn't violate referential integrity after the user row is deleted.
  // Critically, we do NOT clear usedAt — markInviteUsed checks usedById IS NULL,
  // so setting usedById = null on an invite that has usedAt set would allow reuse.
  // Instead we delete those redeemed invites entirely to prevent any reuse.
  await db.delete(invites).where(and(eq(invites.usedById, userId)));
  // Delete invites created by this user that were never redeemed
  await db.delete(invites).where(and(eq(invites.createdById, userId), isNull(invites.usedById)));
  await db.delete(users).where(eq(users.id, userId));
}

// ─── Track Download Counts ─────────────────────────────────────────────────────
export async function getTrackDownloadCounts(): Promise<Map<number, number>> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db
    .select({ trackId: downloads.trackId, count: sql`COUNT(*)` })
    .from(downloads)
    .where(eq(downloads.fileType, 'clean_wav'))
    .groupBy(downloads.trackId);
  const map = new Map<number, number>();
  for (const row of rows) map.set(row.trackId, Number(row.count));
  return map;
}

// ─── Playlist Track Reorder ────────────────────────────────────────────────────
export async function reorderPlaylistTracks(playlistId: number, orderedTrackIds: number[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await Promise.all(
    orderedTrackIds.map((trackId, index) =>
      db.update(playlistTracks)
        .set({ sortOrder: index })
        .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)))
    )
  );
}

// ─── Download History ────────────────────────────────────────────────────────
export async function deleteDownloadEntry(downloadId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Only delete if the download belongs to the requesting user
  await db.delete(downloads).where(and(eq(downloads.id, downloadId), eq(downloads.userId, userId)));
}
