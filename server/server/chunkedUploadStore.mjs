import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const DEFAULT_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_UPLOAD_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_MAX_ACTIVE_UPLOADS = 16;
const DEFAULT_DISK_HEADROOM_BYTES = 256 * 1024 * 1024;
const WRITE_DRAIN_TIMEOUT_MS = 30_000;

export class UploadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'UploadError';
    this.status = status;
  }
}

async function availableDiskBytes(directory) {
  const stats = await statfs(directory);
  return Number(stats.bavail) * Number(stats.bsize);
}

function exactLengthLimiter(expectedBytes) {
  let receivedBytes = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > expectedBytes) {
        callback(new UploadError('Chunk is larger than expected'));
        return;
      }
      callback(null, chunk);
    },
    flush(callback) {
      callback(receivedBytes === expectedBytes ? null : new UploadError('Chunk is incomplete'));
    }
  });
}

function publicUpload(session) {
  return {
    id: session.id,
    chunkSize: session.chunkSize,
    chunkCount: session.chunkCount,
    receivedChunks: [...session.received].sort((left, right) => left - right)
  };
}

export function createChunkedUploadStore({
  uploadDir,
  fileStore,
  chunkSizeBytes = DEFAULT_CHUNK_SIZE_BYTES,
  idleTimeoutMs = DEFAULT_UPLOAD_IDLE_TIMEOUT_MS,
  maxActiveUploads = DEFAULT_MAX_ACTIVE_UPLOADS,
  diskHeadroomBytes = DEFAULT_DISK_HEADROOM_BYTES,
  freeDiskBytes = availableDiskBytes,
  now = () => Date.now()
}) {
  const partialDir = join(uploadDir, '.partial');
  const sessions = new Map();
  const completed = new Map();
  let prepared;

  // Upload sessions live in memory, so partial files left by a previous process can never be resumed.
  function prepare() {
    prepared ??= (async () => {
      await rm(partialDir, { recursive: true, force: true });
      await mkdir(partialDir, { recursive: true });
    })();
    return prepared;
  }

  function ownedSession(id, ownerId) {
    const session = sessions.get(String(id || ''));
    if (!session || session.ownerId !== ownerId) throw new UploadError('Upload not found', 404);
    return session;
  }

  async function discard(session) {
    if (sessions.get(session.id) === session) sessions.delete(session.id);
    session.state = 'closed';
    await rm(session.tempPath, { force: true });
  }

  async function sweep() {
    const current = now();
    for (const session of [...sessions.values()]) {
      if (session.writes.size === 0 && session.state === 'open' && current - session.updatedAt > idleTimeoutMs) {
        await discard(session);
      }
    }
    for (const [id, entry] of completed) {
      if (current - entry.completedAt > idleTimeoutMs) completed.delete(id);
    }
  }

  return {
    prepare,
    sweep,

    startSweeper(intervalMs = 10 * 60 * 1000) {
      const timer = setInterval(() => {
        sweep().catch((error) => console.error(`Upload sweep failed: ${error?.message || error}`));
      }, intervalMs);
      timer.unref?.();
      return () => clearInterval(timer);
    },

    async create({ ownerId, fileName, contentType, sizeBytes, folderId = '', limitBytes = 0 }) {
      await prepare();
      await sweep();

      const size = Number(sizeBytes);
      if (!Number.isSafeInteger(size) || size < 0) throw new UploadError('Invalid file size');
      if (limitBytes > 0 && size > limitBytes) throw new UploadError('File is too large', 413);
      if (!fileStore.hasFolder(folderId)) throw new UploadError('Folder not found', 404);
      if (sessions.size >= maxActiveUploads) throw new UploadError('Too many uploads in progress', 429);

      const reservedBytes = [...sessions.values()].reduce((total, session) => total + session.sizeBytes, 0);
      if (size + reservedBytes + diskHeadroomBytes > (await freeDiskBytes(partialDir))) {
        throw new UploadError('Not enough disk space on the server', 507);
      }

      const id = `upload-${randomUUID()}`;
      const session = {
        id,
        ownerId,
        originalName: String(fileName || 'file'),
        contentType: String(contentType || 'application/octet-stream'),
        sizeBytes: size,
        folderId: String(folderId || ''),
        chunkSize: chunkSizeBytes,
        chunkCount: Math.ceil(size / chunkSizeBytes),
        received: new Set(),
        writes: new Set(),
        tempPath: join(partialDir, `${id}.part`),
        state: 'open',
        updatedAt: now()
      };
      await writeFile(session.tempPath, '');
      sessions.set(id, session);
      return publicUpload(session);
    },

    async writeChunk({ id, ownerId, index, body, contentLength }) {
      const session = ownedSession(id, ownerId);
      if (session.state !== 'open') throw new UploadError('Upload is being finalized', 409);

      const chunkIndex = Number(index);
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.chunkCount) {
        throw new UploadError('Invalid chunk index');
      }
      const start = chunkIndex * session.chunkSize;
      const expectedBytes = Math.min(session.chunkSize, session.sizeBytes - start);
      if (contentLength !== undefined && contentLength !== null && Number(contentLength) !== expectedBytes) {
        throw new UploadError('Chunk size does not match');
      }
      if (!body) throw new UploadError('Chunk body is required');

      session.updatedAt = now();
      // Retried chunks rewrite identical bytes at the same offset, so overlapping writes are harmless.
      const write = pipeline(
        body instanceof Readable ? body : Readable.fromWeb(body),
        exactLengthLimiter(expectedBytes),
        createWriteStream(session.tempPath, { flags: 'r+', start })
      );
      session.writes.add(write);
      try {
        await write;
      } finally {
        session.writes.delete(write);
      }

      if (sessions.get(session.id) !== session) throw new UploadError('Upload was cancelled', 409);
      session.received.add(chunkIndex);
      session.updatedAt = now();
      return { receivedCount: session.received.size, chunkCount: session.chunkCount };
    },

    async complete({ id, ownerId }) {
      const finished = completed.get(String(id || ''));
      if (finished && finished.ownerId === ownerId) return finished.file;

      const session = ownedSession(id, ownerId);
      if (session.state !== 'open') throw new UploadError('Upload is being finalized', 409);
      if (session.received.size !== session.chunkCount) {
        throw new UploadError(`Upload is incomplete (${session.received.size}/${session.chunkCount} chunks)`, 409);
      }

      session.state = 'completing';
      if (session.writes.size > 0) {
        let timer;
        await Promise.race([
          Promise.allSettled([...session.writes]),
          new Promise((resolve) => {
            timer = setTimeout(resolve, WRITE_DRAIN_TIMEOUT_MS);
          })
        ]);
        clearTimeout(timer);
        if (session.writes.size > 0) {
          session.state = 'open';
          throw new UploadError('Chunks are still being written', 409);
        }
      }

      try {
        const { size } = await stat(session.tempPath);
        if (size !== session.sizeBytes) throw new UploadError('Uploaded size does not match');
        const file = await fileStore.saveStoredFile({
          originalName: session.originalName,
          contentType: session.contentType,
          sourcePath: session.tempPath,
          folderId: session.folderId
        });
        sessions.delete(session.id);
        session.state = 'closed';
        completed.set(session.id, { ownerId, file, completedAt: now() });
        return file;
      } catch (error) {
        await discard(session);
        throw error;
      }
    },

    async abort({ id, ownerId }) {
      const session = ownedSession(id, ownerId);
      await discard(session);
      return true;
    },

    activeUploadCount() {
      return sessions.size;
    }
  };
}
