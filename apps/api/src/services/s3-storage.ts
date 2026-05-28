import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ObjectStorage } from "../bindings";

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** S3-compat (Timeweb, MinIO) обычно требует path-style. AWS S3 — virtual-host. */
  forcePathStyle?: boolean;
}

/**
 * S3-совместимое объектное хранилище через @aws-sdk/client-s3.
 *
 * Для Timeweb Cloud S3 — endpoint обычно `https://s3.twcstorage.ru` (или
 * специфичный регион), `forcePathStyle: true`. Точные параметры подтверждаются
 * в ЛК при создании бакета.
 *
 * До session 16 этот слой был CloudflareR2Bucket binding (типы из
 * @cloudflare/workers-types). Теперь — обычный AWS SDK.
 */
export function createS3Client(config: S3StorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle ?? true,
  });
}

export class S3Storage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(
    key: string,
    body: ReadableStream | Uint8Array | Buffer,
    opts?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<void> {
    // AWS SDK v3 поддерживает Buffer/Uint8Array/Readable но не Web ReadableStream.
    // Конвертируем Web stream → Uint8Array через accumulation. Это OK потому что
    // upload route уже ограничен MAX_BYTES = 5 MB через file.size check.
    let bodyBytes: Uint8Array | Buffer;
    if (body instanceof Uint8Array) {
      bodyBytes = body;
    } else if (Buffer.isBuffer(body)) {
      bodyBytes = body;
    } else {
      bodyBytes = await readStreamToBytes(body);
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bodyBytes,
        ContentType: opts?.httpMetadata?.contentType,
        CacheControl: opts?.httpMetadata?.cacheControl,
        Metadata: opts?.customMetadata,
      }),
    );
  }
}

async function readStreamToBytes(stream: ReadableStream): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
