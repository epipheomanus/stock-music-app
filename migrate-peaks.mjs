import mysql from "mysql2/promise";
import { config } from "dotenv";
config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);
try {
  // Check if column already exists
  const [cols] = await conn.execute("SHOW COLUMNS FROM `tracks` LIKE 'waveformPeaks'");
  if (cols.length > 0) {
    console.log("Column waveformPeaks already exists — skipping.");
  } else {
    await conn.execute("ALTER TABLE `tracks` ADD `waveformPeaks` TEXT");
    console.log("Migration applied: added waveformPeaks column to tracks.");
  }
} finally {
  await conn.end();
}
