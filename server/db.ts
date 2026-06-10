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

export async function createInvite(token: string, createdById: number, expiresAt: Date, role: "user" | "admin" = "user", email?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Use raw SQL to avoid Drizzle ORM including all nullable columns in the INSERT
  if (email) {
    await db.execute(
      sql`INSERT INTO invites (token, createdById, expiresAt, role, email) VALUES (${token}, ${createdById}, ${expiresAt}, ${role}, ${email})`
    );
  } else {
    await db.execute(
      sql`INSERT INTO invites (token, createdById, expiresAt, role) VALUES (${token}, ${createdById}, ${expiresAt}, ${role})`
    );
  }
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
  // Use raw SQL so we get a plain ResultSetHeader with a reliable affectedRows count.
  // Drizzle's db.update() returns [ResultSetHeader, FieldPacket[]] but the type
  // casting was reading .affectedRows off the tuple itself (always undefined → ?? 1).
  const result = await db.execute(
    sql`UPDATE invites SET usedById = ${userId}, usedAt = NOW() WHERE token = ${token} AND usedById IS NULL`
  );
  const header = Array.isArray(result) ? result[0] : result;
  const affectedRows = (header as unknown as { affectedRows?: number }).affectedRows ?? 0;
  console.log(`[markInviteUsed] token=${token.slice(0,8)}... userId=${userId} affectedRows=${affectedRows} header=${JSON.stringify(header)}`);
  return affectedRows > 0;
}

export type InviteWithClaimer = Invite & {
  claimedByUsername: string | null;
  claimedByEmail: string | null;
  claimedByName: string | null;
};

export async function getAllInvites(): Promise<InviteWithClaimer[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: invites.id,
      token: invites.token,
      createdById: invites.createdById,
      usedById: invites.usedById,
      usedAt: invites.usedAt,
      expiresAt: invites.expiresAt,
      role: invites.role,
      email: invites.email,
      createdAt: invites.createdAt,
      claimedByUsername: users.username,
      claimedByEmail: users.email,
      claimedByName: users.name,
    })
    .from(invites)
    .leftJoin(users, eq(invites.usedById, users.id))
    .orderBy(desc(invites.createdAt));
  return rows;
}

export async function deleteInvite(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(invites).where(eq(invites.id, id));
}

// ─── Tracks ───────────────────────────────────────────────────────────────────

export async function createTrack(data: InsertTrack): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Build raw SQL INSERT to avoid Drizzle ORM including nullable columns with undefined values
  const cols: string[] = ["title", "isPublished"];
  const vals: unknown[] = [data.title, data.isPublished ?? false];
  const optionals: Array<[string, unknown]> = [
    ["composerName", data.composerName],
    ["description", data.description],
    ["durationSeconds", data.durationSeconds],
    ["bpm", data.bpm],
    ["keySignature", data.keySignature],
    ["wavKey", data.wavKey],
    ["wavUrl", data.wavUrl],
    ["originalWavKey", data.originalWavKey],
    ["originalWavUrl", data.originalWavUrl],
    ["mp3PreviewKey", data.mp3PreviewKey],
    ["mp3PreviewUrl", data.mp3PreviewUrl],
    ["stemsZipKey", data.stemsZipKey],
    ["stemsZipUrl", data.stemsZipUrl],
    ["watermarkedMp3Key", data.watermarkedMp3Key],
    ["watermarkedMp3Url", data.watermarkedMp3Url],
    ["coverArtKey", data.coverArtKey],
    ["coverArtUrl", data.coverArtUrl],
    ["waveformPeaks", data.waveformPeaks],
    ["hasStems", data.hasStems],
    ["watermarkStatus", data.watermarkStatus],
  ];
  for (const [col, val] of optionals) {
    if (val !== undefined && val !== null) { cols.push(col); vals.push(val); }
  }
  const colList = cols.map(c => `\`${c}\``).join(", ");
  // Build a Drizzle sql template with proper parameterization
  const sqlChunks: ReturnType<typeof sql>[] = [
    sql.raw(`INSERT INTO tracks (${colList}) VALUES (`),
  ];
  vals.forEach((v, i) => {
    sqlChunks.push(sql`${v}`);
    if (i < vals.length - 1) sqlChunks.push(sql.raw(", "));
  });
  sqlChunks.push(sql.raw(")"));
  const finalSql = sql.join(sqlChunks, sql.raw(""));
  const result = await db.execute(finalSql);
  const insertId = (result[0] as any).insertId;
  if (!insertId) throw new Error("Failed to get inserted track ID");
  return insertId;
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

export async function logDownload(
  userId: number | null,
  trackId: number,
  projectName: string,
  fileType: "clean_wav" | "watermarked_mp3",
  ipAddress?: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Use raw SQL to avoid Drizzle ORM including all schema columns in the INSERT
  // even when they are not provided, which causes MySQL strict mode errors.
  const hasIp = ipAddress != null && ipAddress !== "";
  if (hasIp) {
    await db.execute(
      sql`INSERT INTO downloads (userId, trackId, projectName, fileType, ipAddress) VALUES (${userId}, ${trackId}, ${projectName}, ${fileType}, ${ipAddress})`
    );
  } else {
    await db.execute(
      sql`INSERT INTO downloads (userId, trackId, projectName, fileType) VALUES (${userId}, ${trackId}, ${projectName}, ${fileType})`
    );
  }
}

export async function getAllDownloads(): Promise<(Download & { userName: string | null; userEmail: string | null; trackTitle: string; composerName: string | null; ipAddress: string | null })[]> {
  const db = await getDb();
  if (!db) return [];
  // Use raw SQL to avoid Drizzle ORM 500 errors caused by nullable column handling on MySQL strict mode
  const result = await db.execute(sql`
    SELECT
      d.id, d.userId, d.trackId, d.projectName, d.downloadedAt, d.fileType, d.ipAddress,
      u.name AS userName, u.email AS userEmail,
      COALESCE(t.title, 'Unknown Track') AS trackTitle,
      t.composerName
    FROM downloads d
    LEFT JOIN users u ON d.userId = u.id
    LEFT JOIN tracks t ON d.trackId = t.id
    ORDER BY d.downloadedAt DESC
  `);
  return ((result as unknown as any[][])[0]) as (Download & { userName: string | null; userEmail: string | null; trackTitle: string; composerName: string | null; ipAddress: string | null })[];
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
  // Use raw SQL to avoid Drizzle ORM including nullable columns with undefined values
  if (data.description) {
    const result = await db.execute(
      sql`INSERT INTO projects (userId, name, description, shareToken) VALUES (${data.userId}, ${data.name}, ${data.description}, ${data.shareToken})`
    );
    return (result[0] as any).insertId;
  } else {
    const result = await db.execute(
      sql`INSERT INTO projects (userId, name, shareToken) VALUES (${data.userId}, ${data.name}, ${data.shareToken})`
    );
    return (result[0] as any).insertId;
  }
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
export async function deleteDownloadAdmin(downloadId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(downloads).where(eq(downloads.id, downloadId));
}

export async function deleteDownloadEntry(downloadId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Only delete if the download belongs to the requesting user
  await db.delete(downloads).where(and(eq(downloads.id, downloadId), eq(downloads.userId, userId)));
}
