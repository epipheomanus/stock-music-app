/**
 * Storage helpers — Cloudflare R2 via AWS S3-compatible API.
 *
 * Required environment variables:
 *   R2_ACCOUNT_ID       — Cloudflare account ID
 *   R2_ACCESS_KEY_ID    — R2 API token access key ID
 *   R2_SECRET_ACCESS_KEY — R2 API token secret access key
 *   R2_BUCKET_NAME      — R2 bucket name
 *   R2_PUBLIC_URL       — Public base URL for the bucket (e.g. https://pub-xxx.r2.dev or custom domain)
 *                         If set, files are served directly from this URL.
 *                         If not set, presigned URLs are generated instead.
 *
 * Falls back to Manus Forge storage when R2 env vars are absent (dev/legacy mode).
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

// ─── R2 client (lazy-initialised) ────────────────────────────────────────────

let _r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (_r2Client) return _r2Client;

  const { r2AccountId, r2AccessKeyId, r2SecretAccessKey } = ENV;
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
    throw new Error(
      "R2 storage not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY."
    );
  }

  _r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });

  return _r2Client;
}

function getBucketName(): string {
  const bucket = ENV.r2BucketName;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set.");
  return bucket;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

/**
 * Build a public URL for a stored key.
 * If R2_PUBLIC_URL is set, use it directly (no signing needed).
 * Otherwise generate a presigned GET URL valid for 1 hour.
 */
async function buildPublicUrl(key: string): Promise<string> {
  if (ENV.r2PublicUrl) {
    const base = ENV.r2PublicUrl.replace(/\/+$/, "");
    return `${base}/${key}`;
  }
  // Fall back to presigned URL
  return storageGetSignedUrl(key);
}

// ─── Manus Forge fallback (used when R2 is not configured) ───────────────────

function isR2Configured(): boolean {
  return !!(ENV.r2AccountId && ENV.r2AccessKeyId && ENV.r2SecretAccessKey && ENV.r2BucketName);
}

async function forgePut(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const forgeUrl = ENV.forgeApiUrl?.replace(/\/+$/, "");
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) throw new Error("Neither R2 nor Forge storage is configured.");

  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });
  if (!presignResp.ok) throw new Error(`Forge presign failed (${presignResp.status})`);
  const { url: s3Url } = (await presignResp.json()) as { url: string };
  const blob = typeof data === "string"
    ? new Blob([data], { type: contentType })
    : new Blob([data as any], { type: contentType });
  const uploadResp = await fetch(s3Url, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
  if (!uploadResp.ok) throw new Error(`Forge upload failed (${uploadResp.status})`);
  return { key, url: `/manus-storage/${key}` };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload a file to R2 (or Forge fallback).
 * Returns { key, url } where url is the public-accessible URL.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));

  if (!isR2Configured()) {
    return forgePut(key, data, contentType);
  }

  const client = getR2Client();
  const bucket = getBucketName();

  const body = typeof data === "string" ? Buffer.from(data) : data;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  const url = await buildPublicUrl(key);
  return { key, url };
}

/**
 * Get the public URL for a stored key (no re-upload).
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  if (!isR2Configured()) {
    return { key, url: `/manus-storage/${key}` };
  }
  const url = await buildPublicUrl(key);
  return { key, url };
}

/**
 * Generate a presigned PUT URL so the browser can upload directly to R2,
 * bypassing the server entirely (avoids Railway's 180s request timeout).
 * Returns { uploadUrl, key, publicUrl } — browser PUTs to uploadUrl,
 * then passes key+publicUrl to the server to save in the database.
 */
export async function storagePresignPut(
  relKey: string,
  contentType = "application/octet-stream",
  expiresIn = 3600
): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));

  if (!isR2Configured()) {
    // Forge fallback: get a presigned PUT URL from Forge
    const forgeUrl = ENV.forgeApiUrl?.replace(/\/+$/, "");
    const forgeKey = ENV.forgeApiKey;
    if (!forgeUrl || !forgeKey) throw new Error("Storage not configured.");
    const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
    presignUrl.searchParams.set("path", key);
    const resp = await fetch(presignUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
    if (!resp.ok) throw new Error(`Forge presign PUT failed (${resp.status})`);
    const { url: uploadUrl } = (await resp.json()) as { url: string };
    return { uploadUrl, key, publicUrl: `/manus-storage/${key}` };
  }

  const client = getR2Client();
  const bucket = getBucketName();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  const publicUrl = await buildPublicUrl(key);
  return { uploadUrl, key, publicUrl };
}

/**
 * Generate a presigned GET URL for a stored key (valid 1 hour).
 * Useful for private buckets or time-limited download links.
 */
export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);

  if (!isR2Configured()) {
    // Forge fallback
    const forgeUrl = ENV.forgeApiUrl?.replace(/\/+$/, "");
    const forgeKey = ENV.forgeApiKey;
    if (!forgeUrl || !forgeKey) throw new Error("Storage not configured.");
    const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
    getUrl.searchParams.set("path", key);
    const resp = await fetch(getUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
    if (!resp.ok) throw new Error(`Forge signed URL failed (${resp.status})`);
    const { url } = (await resp.json()) as { url: string };
    return url;
  }

  const client = getR2Client();
  const bucket = getBucketName();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}
