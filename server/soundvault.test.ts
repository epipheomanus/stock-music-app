import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  getUserById: vi.fn().mockResolvedValue(undefined),
  getUserByEmail: vi.fn().mockResolvedValue(undefined),
  getUserByUsername: vi.fn().mockResolvedValue(undefined),
  createLocalUser: vi.fn().mockResolvedValue(1),
  setResetToken: vi.fn().mockResolvedValue(undefined),
  getUserByResetToken: vi.fn().mockResolvedValue(undefined),
  updatePassword: vi.fn().mockResolvedValue(undefined),
  getAllUsers: vi.fn().mockResolvedValue([]),
  createInvite: vi.fn().mockResolvedValue(undefined),
  getInviteByToken: vi.fn().mockResolvedValue(undefined),
  markInviteUsed: vi.fn().mockResolvedValue(undefined),
  getAllInvites: vi.fn().mockResolvedValue([]),
  createTrack: vi.fn().mockResolvedValue(1),
  updateTrack: vi.fn().mockResolvedValue(undefined),
  deleteTrack: vi.fn().mockResolvedValue(undefined),
  getTrackById: vi.fn().mockResolvedValue(undefined),
  getPublishedTracks: vi.fn().mockResolvedValue([]),
  getAllTracks: vi.fn().mockResolvedValue([]),
  addTrackTag: vi.fn().mockResolvedValue(undefined),
  removeTrackTag: vi.fn().mockResolvedValue(undefined),
  getTagsForTrack: vi.fn().mockResolvedValue([]),
  getTagsForTracks: vi.fn().mockResolvedValue([]),
  replaceTrackTags: vi.fn().mockResolvedValue(undefined),
  getAllDistinctTagValues: vi.fn().mockResolvedValue([]),
  addToCart: vi.fn().mockResolvedValue(undefined),
  removeFromCart: vi.fn().mockResolvedValue(undefined),
  getCartItems: vi.fn().mockResolvedValue([]),
  clearCart: vi.fn().mockResolvedValue(undefined),
  logDownload: vi.fn().mockResolvedValue(undefined),
  getAllDownloads: vi.fn().mockResolvedValue([]),
  getWatermarkConfig: vi.fn().mockResolvedValue(null),
  upsertWatermarkConfig: vi.fn().mockResolvedValue(undefined),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  lockUser: vi.fn().mockResolvedValue(undefined),
  unlockUser: vi.fn().mockResolvedValue(undefined),
  getTrackByTitle: vi.fn().mockResolvedValue(undefined),
  getQuarterlyDownloads: vi.fn().mockResolvedValue(0),
  getYtdDownloads: vi.fn().mockResolvedValue(0),
  retryAllStuckWatermarks: vi.fn().mockResolvedValue(0),
  getUserProjects: vi.fn().mockResolvedValue([]),
  getProjectById: vi.fn().mockResolvedValue(undefined),
  getProjectByShareToken: vi.fn().mockResolvedValue(undefined),
  createProject: vi.fn().mockResolvedValue(1),
  archiveProject: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  createPlaylist: vi.fn().mockResolvedValue(1),
  renamePlaylist: vi.fn().mockResolvedValue(undefined),
  deletePlaylist: vi.fn().mockResolvedValue(undefined),
  getPlaylistById: vi.fn().mockResolvedValue(undefined),
  addTrackToPlaylist: vi.fn().mockResolvedValue(undefined),
  removeTrackFromPlaylist: vi.fn().mockResolvedValue(undefined),
  getPlaylistTracks: vi.fn().mockResolvedValue([]),
}));

// ─── Context helpers ──────────────────────────────────────────────────────────
function makeCtx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
    ...overrides,
  };
}

function makeAdminCtx(): TrpcContext {
  return makeCtx({
    user: {
      id: 1,
      openId: "admin-open-id",
      name: "Admin User",
      email: "admin@example.com",
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      firstName: "Admin",
      lastName: "User",
      company: null,
      username: "admin",
      passwordHash: null,
      resetToken: null,
      resetTokenExpiresAt: null,
    } as any,
  });
}

function makeUserCtx(): TrpcContext {
  return makeCtx({
    user: {
      id: 2,
      openId: "user-open-id",
      name: "Regular User",
      email: "user@example.com",
      loginMethod: "local",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      firstName: "Regular",
      lastName: "User",
      company: null,
      username: "regularuser",
      passwordHash: null,
      resetToken: null,
      resetTokenExpiresAt: null,
    } as any,
  });
}

// ─── Auth tests ───────────────────────────────────────────────────────────────
describe("auth.me", () => {
  it("returns null for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user object for authenticated users", async () => {
    const ctx = makeUserCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.email).toBe("user@example.com");
    expect(result?.role).toBe("user");
  });
});

describe("auth.logout", () => {
  it("clears the session cookie and returns success", async () => {
    const ctx = makeUserCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect((ctx.res.clearCookie as any).mock.calls.length).toBeGreaterThan(0);
  });
});

// ─── Tracks tests ─────────────────────────────────────────────────────────────
describe("tracks.list", () => {
  it("returns empty array when no tracks exist", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tracks.list({});
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("accepts filter parameters without error", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tracks.list({
      genres: ["Cinematic"],
      moods: ["Epic"],
      attributes: ["Orchestral"],
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("tracks.filterOptions", () => {
  it("returns grouped object with genres/moods/attributes arrays", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tracks.filterOptions();
    expect(result).toHaveProperty("genres");
    expect(result).toHaveProperty("moods");
    expect(result).toHaveProperty("attributes");
    expect(Array.isArray(result.genres)).toBe(true);
    expect(Array.isArray(result.moods)).toBe(true);
    expect(Array.isArray(result.attributes)).toBe(true);
  });
});

// ─── Admin guard tests ────────────────────────────────────────────────────────
describe("admin procedures", () => {
  it("rejects non-admin users from admin.stats", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.admin.stats()).rejects.toThrow();
  });

  it("rejects unauthenticated users from admin.stats", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.admin.stats()).rejects.toThrow();
  });

  it("allows admin users to access admin.stats", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.stats();
    expect(result).toHaveProperty("totalTracks");
    expect(result).toHaveProperty("quarterlyDownloads");
    expect(result).toHaveProperty("totalUsers");
  });

  it("allows admin users to list invites", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.invites.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects non-admin from invites.list", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.invites.list()).rejects.toThrow();
  });
});

// ─── Cart tests ───────────────────────────────────────────────────────────────
describe("cart procedures", () => {
  it("rejects unauthenticated users from cart.list", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.cart.list()).rejects.toThrow();
  });

  it("allows authenticated users to list cart", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    const result = await caller.cart.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects unauthenticated users from cart.add", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.cart.add({ trackId: 1 })).rejects.toThrow();
  });

  it("allows authenticated users to add to cart", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    const result = await caller.cart.add({ trackId: 1 });
    expect(result.success).toBe(true);
  });

  it("allows authenticated users to remove from cart", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    const result = await caller.cart.remove({ trackId: 1 });
    expect(result.success).toBe(true);
  });
});

// ─── Download tests ───────────────────────────────────────────────────────────
describe("downloads.checkout", () => {
  it("rejects unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.downloads.checkout({ projectName: "Test Project", trackIds: [1] })
    ).rejects.toThrow();
  });

  it("requires projectName to be non-empty", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.downloads.checkout({ projectName: "", trackIds: [1] })
    ).rejects.toThrow();
  });

  it("requires at least one trackId", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.downloads.checkout({ projectName: "Test", trackIds: [] })
    ).rejects.toThrow();
  });

  it("returns empty files array when tracks not found", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    const result = await caller.downloads.checkout({
      projectName: "Test Project",
      trackIds: [999],
    });
    expect(result.success).toBe(true);
    expect(result.files).toEqual([]);
  });
});

// ─── Watermark tests ──────────────────────────────────────────────────────────
describe("watermark.getConfig", () => {
  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(caller.watermark.getConfig()).rejects.toThrow();
  });

  it("returns null when no watermark configured", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.watermark.getConfig();
    expect(result).toBeNull();
  });
});

// ─── Download originalWavUrl tests ────────────────────────────────────────────
describe("downloads.checkout - originalWavUrl preference", () => {
  it("serves originalWavUrl (24-bit) when available instead of wavUrl (16-bit)", async () => {
    const { getTrackById, logDownload, clearCart } = await import("./db");
    vi.mocked(getTrackById).mockResolvedValueOnce({
      id: 1,
      title: "Test Track",
      wavUrl: "/manus-storage/tracks/1/wav/clean_16bit.wav",
      originalWavUrl: "/manus-storage/tracks/1/wav/original_24bit.wav",
      originalWavKey: "tracks/1/wav/original_24bit.wav",
      wavKey: "tracks/1/wav/clean_16bit.wav",
      stemsZipUrl: null,
      hasStems: false,
      isPublished: true,
      watermarkStatus: "done",
    } as any);
    vi.mocked(logDownload).mockResolvedValueOnce(undefined);
    vi.mocked(clearCart).mockResolvedValueOnce(undefined);

    const caller = appRouter.createCaller(makeUserCtx());
    const result = await caller.downloads.checkout({
      projectName: "My Project",
      trackIds: [1],
    });

    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(1);
    // Should return the 24-bit original, NOT the 16-bit playback version
    expect(result.files[0].wavUrl).toBe("/manus-storage/tracks/1/wav/original_24bit.wav");
  });

  it("falls back to wavUrl when originalWavUrl is not set", async () => {
    const { getTrackById, logDownload, clearCart } = await import("./db");
    vi.mocked(getTrackById).mockResolvedValueOnce({
      id: 2,
      title: "Legacy Track",
      wavUrl: "/manus-storage/tracks/2/wav/clean.wav",
      originalWavUrl: null,
      originalWavKey: null,
      wavKey: "tracks/2/wav/clean.wav",
      stemsZipUrl: null,
      hasStems: false,
      isPublished: true,
      watermarkStatus: "done",
    } as any);
    vi.mocked(logDownload).mockResolvedValueOnce(undefined);
    vi.mocked(clearCart).mockResolvedValueOnce(undefined);

    const caller = appRouter.createCaller(makeUserCtx());
    const result = await caller.downloads.checkout({
      projectName: "My Project",
      trackIds: [2],
    });

    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(1);
    // Falls back to wavUrl when no originalWavUrl
    expect(result.files[0].wavUrl).toBe("/manus-storage/tracks/2/wav/clean.wav");
  });
});
