/**
 * Upload font files from Manus storage to Cloudflare R2.
 * Run: node scripts/upload-fonts-to-r2.mjs
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream } from "fs";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error("Missing R2 environment variables");
  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const FONTS = [
  { manusKey: "oswald-400_ebb1cfc8.ttf", r2Key: "fonts/oswald-400.ttf" },
  { manusKey: "oswald-500_d9f25477.ttf", r2Key: "fonts/oswald-500.ttf" },
  { manusKey: "oswald-600_1ea619e5.ttf", r2Key: "fonts/oswald-600.ttf" },
  { manusKey: "oswald-700_f83c9796.ttf", r2Key: "fonts/oswald-700.ttf" },
  { manusKey: "noticia-text-400_47bb81fe.ttf", r2Key: "fonts/noticia-text-400.ttf" },
  { manusKey: "noticia-text-700_b3f84d59.ttf", r2Key: "fonts/noticia-text-700.ttf" },
  { manusKey: "noticia-text-400i_beff0ba5.ttf", r2Key: "fonts/noticia-text-400i.ttf" },
  { manusKey: "noticia-text-700i_6abcba2e.ttf", r2Key: "fonts/noticia-text-700i.ttf" },
];

async function getManusPresignedUrl(key) {
  const url = new URL("v1/storage/presign/get", FORGE_API_URL + "/");
  url.searchParams.set("path", key);
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${FORGE_API_KEY}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Forge presign failed (${resp.status}): ${text}`);
  }
  const { url: signedUrl } = await resp.json();
  return signedUrl;
}

async function uploadFont(font) {
  console.log(`\n[${font.r2Key}] Fetching from Manus storage...`);
  
  // Get presigned URL from Manus Forge
  const signedUrl = await getManusPresignedUrl(font.manusKey);
  
  // Download the font file
  const downloadResp = await fetch(signedUrl);
  if (!downloadResp.ok) {
    throw new Error(`Download failed (${downloadResp.status}) for ${font.manusKey}`);
  }
  
  const buffer = Buffer.from(await downloadResp.arrayBuffer());
  console.log(`  Downloaded: ${buffer.length} bytes`);
  
  // Upload to R2
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: font.r2Key,
    Body: buffer,
    ContentType: "font/ttf",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  
  const publicUrl = `${R2_PUBLIC_URL.replace(/\/+$/, "")}/${font.r2Key}`;
  console.log(`  Uploaded to R2: ${publicUrl}`);
  return publicUrl;
}

async function main() {
  console.log("=== Font Upload to Cloudflare R2 ===");
  console.log(`Bucket: ${R2_BUCKET_NAME}`);
  console.log(`Public URL base: ${R2_PUBLIC_URL}`);
  
  const results = [];
  
  for (const font of FONTS) {
    try {
      const url = await uploadFont(font);
      results.push({ font: font.r2Key, url, success: true });
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({ font: font.r2Key, error: err.message, success: false });
    }
  }
  
  console.log("\n=== Results ===");
  for (const r of results) {
    if (r.success) {
      console.log(`✓ ${r.font}`);
      console.log(`  ${r.url}`);
    } else {
      console.log(`✗ ${r.font}: ${r.error}`);
    }
  }
  
  const successful = results.filter(r => r.success);
  console.log(`\n${successful.length}/${results.length} fonts uploaded successfully.`);
  
  if (successful.length > 0) {
    console.log("\n=== index.html @font-face URLs ===");
    for (const r of successful) {
      console.log(`  ${r.url}`);
    }
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
