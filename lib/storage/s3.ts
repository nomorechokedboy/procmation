import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_MAX_MB = 25;
const UPLOAD_URL_SECONDS = 10 * 60;
const DOWNLOAD_URL_SECONDS = 60;

type StorageConfig = {
  bucket: string;
  client: S3Client;
  maxBytes: number;
};

let cached: StorageConfig | null | undefined;

// Attachments need an S3-compatible bucket (AWS S3, MinIO, R2...). Without
// S3_BUCKET the feature is off and nothing else is affected.
function config(): StorageConfig | null {
  if (cached !== undefined) {
    return cached;
  }
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    cached = null;
    return cached;
  }
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const maxMb = Number(process.env.ATTACHMENT_MAX_MB) || DEFAULT_MAX_MB;
  cached = {
    bucket,
    client: new S3Client({
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
      endpoint,
      // MinIO and most self-hosted stores need bucket-in-path addressing
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE
        ? process.env.S3_FORCE_PATH_STYLE === "true"
        : Boolean(endpoint),
      region: process.env.S3_REGION || "us-east-1",
    }),
    maxBytes: maxMb * 1024 * 1024,
  };
  return cached;
}

function required(): StorageConfig {
  const current = config();
  if (!current) {
    throw new Error("Attachments are not configured");
  }
  return current;
}

export function attachmentSettings(): { enabled: boolean; maxBytes: number } {
  const current = config();
  return {
    enabled: current !== null,
    maxBytes: current?.maxBytes ?? 0,
  };
}

// A short-lived URL the browser PUTs the file to
export function presignUpload(key: string, contentType: string) {
  const { bucket, client } = required();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      ContentType: contentType,
      Key: key,
    }),
    { expiresIn: UPLOAD_URL_SECONDS }
  );
}

// A short-lived URL that downloads the file under its own name
export function presignDownload(key: string, filename: string) {
  const { bucket, client } = required();
  const safe = encodeURIComponent(filename);
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${safe}`,
    }),
    { expiresIn: DOWNLOAD_URL_SECONDS }
  );
}

// The stored size, or null when nothing was uploaded
export async function storedSize(key: string): Promise<number | null> {
  const { bucket, client } = required();
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

export async function deleteStored(key: string): Promise<void> {
  const { bucket, client } = required();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    console.error(
      "[storage] could not delete object:",
      error instanceof Error ? error.message : "unknown error"
    );
  }
}
