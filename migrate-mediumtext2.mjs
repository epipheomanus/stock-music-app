import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);
try {
  await conn.execute("ALTER TABLE `tracks` MODIFY COLUMN `waveformPeaks` MEDIUMTEXT");
  console.log("✅ waveformPeaks column changed to MEDIUMTEXT");
} catch (err) {
  if (err.code === "ER_DUP_FIELDNAME" || String(err).includes("already")) {
    console.log("Column already MEDIUMTEXT — skipping");
  } else {
    throw err;
  }
} finally {
  await conn.end();
}
