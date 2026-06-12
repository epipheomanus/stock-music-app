import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerUploadRoutes } from "../uploadRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn("[Migrations] DATABASE_URL not set, skipping migrations");
    return;
  }
  try {
    // In production the bundle lives at dist/index.js and migrations are at dist/drizzle/
    // In development the file is at server/_core/index.ts and migrations are at drizzle/
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const migrationsFolder = path.resolve(__dirname, "../../drizzle");
    const db = drizzle(process.env.DATABASE_URL);
    console.log(`[Migrations] Running pending migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    console.log("[Migrations] All migrations applied successfully.");
  } catch (err) {
    console.error("[Migrations] Failed to run migrations:", err);
    // Don't crash the server — log and continue so the app stays up
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Run DB migrations before accepting any requests
  await runMigrations();

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Plain health check endpoint for Railway (must return 200 for custom domain routing)
  app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerUploadRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  // In production (Railway), always bind directly to the assigned PORT on 0.0.0.0
  // so Railway's proxy can route custom domain traffic correctly.
  // In development, scan for an available port to avoid conflicts.
  const port = process.env.NODE_ENV === "production"
    ? preferredPort
    : await findAvailablePort(preferredPort);

  if (process.env.NODE_ENV !== "production" && port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
