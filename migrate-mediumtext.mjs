import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
import { readFileSync } from "fs";

// Load env
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

// Parse mysql2 connection URL
const conn = await createConnection(url);
try {
  console.log("Applying migration: ALTER TABLE tracks MODIFY COLUMN waveformPeaks mediumtext");
  await conn.execute("ALTER TABLE `tracks` MODIFY COLUMN `waveformPeaks` mediumtext");
  console.log("Migration applied successfully");
} finally {
  await conn.end();
}
