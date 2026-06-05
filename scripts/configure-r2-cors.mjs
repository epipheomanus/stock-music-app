/**
 * Configure CORS on the Cloudflare R2 bucket to allow browser audio/font requests.
 * Run: node scripts/configure-r2-cors.mjs
 *
 * This sets up CORS rules that allow:
 * - GET requests for audio files from any origin (for browser audio playback)
 * - GET requests for font files from any origin
 * - HEAD requests (needed by some audio players to check content-length)
 */

import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

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

const corsConfig = {
  CORSRules: [
    {
      // Allow browser audio playback and font loading from any origin
      // This covers Railway deployment, music.epipheo.com, and local dev
      AllowedOrigins: ["*"],
      AllowedMethods: ["GET", "HEAD"],
      AllowedHeaders: ["*"],
      ExposeHeaders: [
        "Content-Length",
        "Content-Type",
        "Content-Range",
        "Accept-Ranges",
        "ETag",
        "Last-Modified",
      ],
      MaxAgeSeconds: 86400, // 24 hours
    },
  ],
};

async function main() {
  console.log(`=== Configuring CORS on R2 bucket: ${R2_BUCKET_NAME} ===`);
  console.log("CORS rules to apply:");
  console.log(JSON.stringify(corsConfig, null, 2));

  try {
    await r2.send(
      new PutBucketCorsCommand({
        Bucket: R2_BUCKET_NAME,
        CORSConfiguration: corsConfig,
      })
    );
    console.log("\n✓ CORS configuration applied successfully!");
  } catch (err) {
    console.error("✗ Failed to apply CORS configuration:", err.message);
    process.exit(1);
  }

  // Verify the configuration was applied
  try {
    const result = await r2.send(
      new GetBucketCorsCommand({ Bucket: R2_BUCKET_NAME })
    );
    console.log("\n=== Verified CORS configuration ===");
    console.log(JSON.stringify(result.CORSRules, null, 2));
  } catch (err) {
    console.warn("Could not verify CORS configuration:", err.message);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
