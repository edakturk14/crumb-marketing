import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./db.mjs";
export const storageMode = process.env.S3_BUCKET ? "s3" : "local";
const client =
  storageMode === "s3"
    ? new S3Client({
        region: process.env.S3_REGION || "auto",
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: !!process.env.S3_ENDPOINT,
        credentials: process.env.S3_ACCESS_KEY_ID
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
      })
    : null;
export async function saveObject(key, buffer, mime) {
  if (client)
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mime,
      }),
    );
  else {
    await mkdir(path.join(dataDir, "objects"), { recursive: true });
    await writeFile(path.join(dataDir, "objects", key), buffer);
  }
  return `/api/files/${key}`;
}
export async function readObject(key) {
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) throw new Error("Invalid key");
  if (client) {
    const r = await client.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
    return Buffer.from(await r.Body.transformToByteArray());
  }
  return readFile(path.join(dataDir, "objects", key));
}
