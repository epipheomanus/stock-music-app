/**
 * Upload logo images from Manus storage to Cloudflare R2.
 * Run: node scripts/upload-logos-to-r2.mjs
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

const IMAGES = [
  {
    manusKey: "epipheo-logo-black-transparent_5380d099.png",
    r2Key: "assets/epipheo-logo-black-transparent.png",
    contentType: "image/png",
  },
  {
    manusKey: "epipheo-logo-white-transparent_1da09ee5.png",
    r2Key: "assets/epipheo-logo-white-transparent.png",
    contentType: "image/png",
  },
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

async function uploadImage(img) {
  console.log(`\n[${img.r2Key}] Fetching from Manus storage...`);

  const signedUrl = await getManusPresignedUrl(img.manusKey);
  const downloadResp = await fetch(signedUrl);
  if (!downloadResp.ok) {
    throw new Error(`Download failed (${downloadResp.status}) for ${img.manusKey}`);
  }

  const buffer = Buffer.from(await downloadResp.arrayBuffer());
  console.log(`  Downloaded: ${buffer.length} bytes`);

  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: img.r2Key,
    Body: buffer,
    ContentType: img.contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  const publicUrl = `${R2_PUBLIC_URL.replace(/\/+$/, "")}/${img.r2Key}`;
  console.log(`  Uploaded to R2: ${publicUrl}`);
  return publicUrl;
}

async function main() {
  console.log("=== Logo Upload to Cloudflare R2 ===");

  const results = [];
  for (const img of IMAGES) {
    try {
      const url = await uploadImage(img);
      results.push({ key: img.r2Key, url, success: true });
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({ key: img.r2Key, error: err.message, success: false });
    }
  }

  console.log("\n=== Results ===");
  for (const r of results) {
    if (r.success) {
      console.log(`✓ ${r.key}`);
      console.log(`  ${r.url}`);
    } else {
      console.log(`✗ ${r.key}: ${r.error}`);
    }
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
