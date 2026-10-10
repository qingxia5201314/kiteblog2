import { apiFetch } from './apiClient';
import {
  UploadProgressHandler,
  UploadRequestError,
  parseJsonText,
  sendWithUploadProgress,
  uploadErrorMessage
} from './uploadProgress';

interface ChunkedUploadSession {
  id: string;
  chunkSize: number;
  chunkCount: number;
}

export interface ChunkedUploadOptions {
  endpoint: string;
  file: File;
  fields?: Record<string, string>;
  onProgress?: UploadProgressHandler;
  concurrency?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  stallTimeoutMs?: number;
}

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 15_000;
const DEFAULT_STALL_TIMEOUT_MS = 60_000;
const SPEED_WINDOW_MS = 5000;

function isRetryable(error: unknown) {
  if (!(error instanceof UploadRequestError)) return false;
  const { status } = error;
  return status === 0 || status === 408 || status === 429 || (status >= 500 && status !== 501 && status !== 507);
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new UploadRequestError('上传已取消', 0));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function withRetry<T>(
  task: () => Promise<T>,
  { maxAttempts, retryDelayMs, signal, onRetry }: {
    maxAttempts: number;
    retryDelayMs: number;
    signal?: AbortSignal;
    onRetry?: () => void;
  }
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (signal?.aborted || attempt >= maxAttempts || !isRetryable(error)) throw error;
      onRetry?.();
      await wait(Math.min(retryDelayMs * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS), signal);
    }
  }
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(url, init);
  } catch {
    throw new UploadRequestError('上传失败，请检查网络连接', 0);
  }
  const text = await response.text();
  if (!response.ok) throw new UploadRequestError(uploadErrorMessage(response.status, text), response.status);
  const payload = parseJsonText(text);
  if (!payload) throw new UploadRequestError('服务器返回了无法识别的响应', response.status);
  return payload as T;
}

function createProgressTracker(total: number, onProgress?: UploadProgressHandler) {
  const chunkBytes = new Map<number, number>();
  const samples = [{ at: Date.now(), loaded: 0 }];
  let loaded = 0;

  return {
    set(index: number, bytes: number) {
      loaded += bytes - (chunkBytes.get(index) ?? 0);
      chunkBytes.set(index, bytes);
      if (!onProgress) return;

      // Speed is averaged over a sliding window so it reflects the current rate, not the whole upload.
      const now = Date.now();
      samples.push({ at: now, loaded });
      while (samples.length > 2 && now - samples[1].at >= SPEED_WINDOW_MS) samples.shift();
      const seconds = Math.max((now - samples[0].at) / 1000, 0.001);
      onProgress({
        loaded,
        total,
        percent: total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 100,
        speedBytesPerSecond: Math.max(0, (loaded - samples[0].loaded) / seconds)
      });
    }
  };
}

// Splits a file into server-sized chunks so no single request hits proxy body limits or timeouts,
// uploads several chunks in parallel and retries transient failures per chunk.
export async function uploadInChunks<T>({
  endpoint,
  file,
  fields = {},
  onProgress,
  concurrency = DEFAULT_CONCURRENCY,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS
}: ChunkedUploadOptions): Promise<T> {
  const retry = { maxAttempts, retryDelayMs };
  const { upload } = await withRetry(
    () =>
      requestJson<{ upload: ChunkedUploadSession }>(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...fields,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size
        })
      }),
    retry
  );
  if (!upload?.id || !(upload.chunkSize > 0) || !(upload.chunkCount >= 0)) {
    throw new UploadRequestError('服务器返回了无法识别的响应', 200);
  }

  const uploadUrl = `${endpoint}/${encodeURIComponent(upload.id)}`;
  const tracker = createProgressTracker(file.size, onProgress);
  const controller = new AbortController();
  let nextIndex = 0;
  let firstError: unknown = null;

  const uploadChunk = (index: number) => {
    const start = index * upload.chunkSize;
    const blob = file.slice(start, Math.min(file.size, start + upload.chunkSize));
    return withRetry(
      () =>
        sendWithUploadProgress({
          body: blob,
          headers: { 'content-type': 'application/octet-stream' },
          method: 'PUT',
          onUploadProgress: (loaded) => tracker.set(index, Math.min(loaded, blob.size)),
          signal: controller.signal,
          stallTimeoutMs,
          url: `${uploadUrl}/chunks/${index}`
        }),
      { ...retry, signal: controller.signal, onRetry: () => tracker.set(index, 0) }
    ).then(() => tracker.set(index, blob.size));
  };

  const worker = async () => {
    while (!controller.signal.aborted && nextIndex < upload.chunkCount) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        await uploadChunk(index);
      } catch (error) {
        firstError ??= error;
        controller.abort();
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, upload.chunkCount) }, worker));
    if (firstError) throw firstError;
    return await withRetry(() => requestJson<T>(`${uploadUrl}/complete`, { method: 'POST' }), retry);
  } catch (error) {
    const status = error instanceof UploadRequestError ? error.status : 0;
    if (status !== 401 && status !== 404) {
      void apiFetch(uploadUrl, { method: 'DELETE' }).catch(() => undefined);
    }
    throw error;
  }
}
