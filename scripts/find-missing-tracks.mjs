/**
 * Compare CSV track list against DB and find missing tracks.
 */
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import mysql from 'mysql2/promise';

const csvPath = '/home/ubuntu/upload/MusicLibrary-Bulkimportview.csv';
const raw = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, ''); // strip BOM

const records = parse(raw, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

console.log('CSV total rows:', records.length);
console.log('CSV columns:', Object.keys(records[0]));

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [dbRows] = await conn.execute('SELECT title FROM tracks ORDER BY title');
await conn.end();

const dbTitles = new Set(dbRows.map(r => r.title.toLowerCase().trim()));
console.log('DB track count:', dbTitles.size);

// Find tracks in CSV that are NOT in DB
const missing = records.filter(r => {
  const title = (r['Track Name'] || '').toLowerCase().trim();
  return title && !dbTitles.has(title);
});

// Find tracks in CSV with status != 'Complete'
const incomplete = records.filter(r => {
  const status = (r['Status'] || '').toLowerCase().trim();
  return status !== 'complete';
});

console.log('\n=== MISSING TRACKS (in CSV but not in DB) ===');
missing.forEach(r => {
  console.log(`  - "${r['Track Name']}" | Status: ${r['Status']} | URL: ${r['Track']?.substring(0, 60)}...`);
});
console.log(`\nTotal missing: ${missing.length}`);

console.log('\n=== INCOMPLETE STATUS TRACKS ===');
incomplete.forEach(r => {
  console.log(`  - "${r['Track Name']}" | Status: ${r['Status']}`);
});
console.log(`Total incomplete: ${incomplete.length}`);

// Missing tracks that are Complete and have a URL
const readyToImport = missing.filter(r => {
  const status = (r['Status'] || '').toLowerCase().trim();
  const url = (r['Track'] || '').trim();
  return status === 'complete' && url.startsWith('http');
});
console.log(`\n=== READY TO IMPORT (Complete + has URL) ===`);
readyToImport.forEach(r => {
  console.log(`  - "${r['Track Name']}" | ${r['Genre']} | ${r['Mood / Attributes']}`);
});
console.log(`Total ready to import: ${readyToImport.length}`);
