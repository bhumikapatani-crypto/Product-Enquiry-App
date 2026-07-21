import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from "file-type";

const MAX_BYTES = 10 * 1_024 * 1_024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "doc", "docx", "xls", "xlsx"]);

export class AttachmentValidationError extends Error {}

export type StoredAttachment = {
  storageKey: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  checksum?: string;
};

const getS3Client = () =>
  new S3Client({
    region: process.env.FILE_STORAGE_REGION || "auto",
    endpoint: process.env.FILE_STORAGE_ENDPOINT || undefined,
    forcePathStyle: process.env.FILE_STORAGE_FORCE_PATH_STYLE === "true",
    credentials:
      process.env.FILE_STORAGE_ACCESS_KEY_ID && process.env.FILE_STORAGE_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.FILE_STORAGE_ACCESS_KEY_ID,
            secretAccessKey: process.env.FILE_STORAGE_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

function safeOriginalName(name: string) {
  return path.basename(name).normalize("NFKC").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 255) || "attachment";
}

export async function storeAttachment(file: File | null, shopId: string): Promise<StoredAttachment | null> {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_BYTES) throw new AttachmentValidationError("The attachment exceeds 10 MB.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_EXTENSIONS.has(detected.ext)) {
    throw new AttachmentValidationError("The attachment type is not supported.");
  }

  const date = new Date();
  const storageKey = `${shopId}/${date.getUTCFullYear()}/${randomUUID()}.${detected.ext}`;
  const originalName = safeOriginalName(file.name);

  if (process.env.FILE_STORAGE_BUCKET) {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: process.env.FILE_STORAGE_BUCKET,
        Key: storageKey,
        Body: buffer,
        ContentType: detected.mime,
        Metadata: { originalName: encodeURIComponent(originalName) },
      }),
    );
  } else if (process.env.NODE_ENV !== "production") {
    const target = path.join(process.cwd(), ".data", "private-uploads", ...storageKey.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer, { flag: "wx" });
  } else {
    throw new Error("Private file storage is not configured.");
  }

  return { storageKey, originalName, mimeType: detected.mime, byteSize: buffer.byteLength };
}

export async function deleteStoredAttachment(storageKey: string) {
  if (process.env.FILE_STORAGE_BUCKET) {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: process.env.FILE_STORAGE_BUCKET, Key: storageKey }));
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    const target = path.resolve(process.cwd(), ".data", "private-uploads", ...storageKey.split("/"));
    const root = path.resolve(process.cwd(), ".data", "private-uploads");
    if (target.startsWith(`${root}${path.sep}`)) await unlink(target).catch(() => undefined);
  }
}
