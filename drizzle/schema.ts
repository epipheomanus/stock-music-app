import {
  boolean,
  int,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  bigint,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  firstName: varchar("firstName", { length: 128 }),
  lastName: varchar("lastName", { length: 128 }),
  company: varchar("company", { length: 256 }),
  jobTitle: varchar("jobTitle", { length: 128 }),
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: varchar("passwordHash", { length: 256 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  resetToken: varchar("resetToken", { length: 128 }),
  resetTokenExpiresAt: timestamp("resetTokenExpiresAt"),
  isLocked: boolean("isLocked").default(false).notNull(),
  skipWatermarkConfirm: boolean("skipWatermarkConfirm").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Invites ──────────────────────────────────────────────────────────────────
export const invites = mysqlTable("invites", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  createdById: int("createdById").notNull(),
  usedById: int("usedById"),
  usedAt: timestamp("usedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Invite = typeof invites.$inferSelect;

// ─── Tracks ───────────────────────────────────────────────────────────────────
export const tracks = mysqlTable("tracks", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  composerName: varchar("composerName", { length: 256 }),
  description: text("description"),
  durationSeconds: int("durationSeconds"),
  bpm: int("bpm"),
  // Storage keys (S3)
  wavKey: varchar("wavKey", { length: 512 }),
  wavUrl: varchar("wavUrl", { length: 1024 }),
  // Original 24-bit WAV preserved for download; wavUrl holds the 16-bit browser-playback version
  originalWavKey: varchar("originalWavKey", { length: 512 }),
  originalWavUrl: varchar("originalWavUrl", { length: 1024 }),
  // 192kbps MP3 for fast browser streaming/playback (not for download)
  mp3PreviewKey: varchar("mp3PreviewKey", { length: 512 }),
  mp3PreviewUrl: varchar("mp3PreviewUrl", { length: 1024 }),
  stemsZipKey: varchar("stemsZipKey", { length: 512 }),
  stemsZipUrl: varchar("stemsZipUrl", { length: 1024 }),
  watermarkedMp3Key: varchar("watermarkedMp3Key", { length: 512 }),
  watermarkedMp3Url: varchar("watermarkedMp3Url", { length: 1024 }),
  coverArtKey: varchar("coverArtKey", { length: 512 }),
  coverArtUrl: varchar("coverArtUrl", { length: 1024 }),
   keySignature: varchar("keySignature", { length: 64 }),
  // Pre-computed waveform peaks for instant canvas rendering (JSON array of floats)
  waveformPeaks: mediumtext("waveformPeaks"),
  hasStems: boolean("hasStems").default(false).notNull(),
  watermarkStatus: mysqlEnum("watermarkStatus", ["pending","processing","done","error"])
    .default("pending")
    .notNull(),
  isPublished: boolean("isPublished").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Track = typeof tracks.$inferSelect;
export type InsertTrack = typeof tracks.$inferInsert;

// ─── Track Tags ───────────────────────────────────────────────────────────────
export const trackTags = mysqlTable("track_tags", {
  id: int("id").autoincrement().primaryKey(),
  trackId: int("trackId").notNull(),
  type: mysqlEnum("type", ["genre", "mood", "attribute", "hidden"]).notNull(),
  value: varchar("value", { length: 128 }).notNull(),
});

export type TrackTag = typeof trackTags.$inferSelect;

// ─── Cart Items ───────────────────────────────────────────────────────────────
export const cartItems = mysqlTable("cart_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  trackId: int("trackId").notNull(),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
});

export type CartItem = typeof cartItems.$inferSelect;

// ─── Downloads ────────────────────────────────────────────────────────────────
export const downloads = mysqlTable("downloads", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  trackId: int("trackId").notNull(),
  projectName: varchar("projectName", { length: 256 }).notNull(),
  downloadedAt: timestamp("downloadedAt").defaultNow().notNull(),
  fileType: mysqlEnum("fileType", ["clean_wav", "watermarked_mp3"]).default("clean_wav").notNull(),
});

export type Download = typeof downloads.$inferSelect;

// ─── Taxonomy Tags ──────────────────────────────────────────────────────────
// Stores the canonical list of tags shown in Browse dropdowns (admin-managed)
export const taxonomyTags = mysqlTable("taxonomy_tags", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["genre", "mood", "attribute"]).notNull(),
  value: varchar("value", { length: 128 }).notNull(),
});
export type TaxonomyTag = typeof taxonomyTags.$inferSelect;

// ─── Watermark Config ─────────────────────────────────────────────────────────
export const watermarkConfig = mysqlTable("watermark_config", {
  id: int("id").autoincrement().primaryKey(),
  audioKey: varchar("audioKey", { length: 512 }),
  audioUrl: varchar("audioUrl", { length: 1024 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WatermarkConfig = typeof watermarkConfig.$inferSelect;

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  shareToken: varchar("shareToken", { length: 64 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ─── Playlists ────────────────────────────────────────────────────────────────
export const playlists = mysqlTable("playlists", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Playlist = typeof playlists.$inferSelect;
export type InsertPlaylist = typeof playlists.$inferInsert;

// ─── Playlist Tracks ──────────────────────────────────────────────────────────
export const playlistTracks = mysqlTable("playlist_tracks", {
  id: int("id").autoincrement().primaryKey(),
  playlistId: int("playlistId").notNull(),
  trackId: int("trackId").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
});
export type PlaylistTrack = typeof playlistTracks.$inferSelect;
