import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();
const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("SHOW COLUMNS FROM tracks LIKE 'waveformPeaks'");
console.log(JSON.stringify(rows));
await conn.end();
