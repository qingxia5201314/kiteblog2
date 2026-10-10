import { broadcastAuthExpiry } from './apiClient';

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
  speedBytesPerSecond: number;
}

export type UploadProgressHandler = (progress: UploadProgress) => void;

export class UploadRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'UploadRequestError';
    this.status = status;
  }
}

interface UploadFormDataOptions {
  formData: FormData;
  method?: string;
  onProgress?: UploadProgressHandler;
  url: string;
}

interface UploadRequestOptions {
  body: XMLHttpRequestBodyInit;
  headers?: Record<string, string>;
  method?: string;
  onUploadProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
  stallTimeoutMs?: number;
  url: string;
}

export function parseJsonText(text: string): Record<string, unknown> | null {
  if (!text.trim()) return {};
  try {
    const payload: unknown = JSON.parse(text);
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

// Proxies such as Cloudflare answer with HTML error pages, so never assume the body is JSON.
export function uploadErrorMessage(status: number, responseText: string): string {
  const message = parseJsonText(responseText)?.message;
  if (typeof message === 'string' && message) return message;
  if (status === 413) return '文件超过了服务器允许的单次请求大小（HTTP 413）';
  return `上传失败（HTTP ${status}）`;
}

export function sendWithUploadProgress<T>({
  body,
  headers = {},
  method = 'POST',
  onUploadProgress,
  signal,
  stallTimeoutMs = 0,
  url
}: UploadRequestOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadRequestError('上传已取消', 0));
      return;
    }

    const xhr = new XMLHttpRequest();
    let stalled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;

    const armStallTimer = () => {
      if (stallTimeoutMs <= 0) return;
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        xhr.abort();
      }, stallTimeoutMs);
    };
    const onSignalAbort = () => xhr.abort();
    const settle = () => {
      clearTimeout(stallTimer);
      signal?.removeEventListener('abort', onSignalAbort);
    };

    xhr.open(method, url);
    xhr.withCredentials = true;
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));

    xhr.upload.onprogress = (event) => {
      armStallTimer();
      if (event.lengthComputable) onUploadProgress?.(event.loaded, event.total);
    };

    xhr.onload = () => {
      settle();
      const text = String(xhr.responseText || '');
      if (xhr.status === 401) broadcastAuthExpiry();
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new UploadRequestError(uploadErrorMessage(xhr.status, text), xhr.status));
        return;
      }
      const payload = parseJsonText(text);
      if (!payload) {
        reject(new UploadRequestError('服务器返回了无法识别的响应', xhr.status));
        return;
      }
      resolve(payload as T);
    };
    xhr.onerror = () => {
      settle();
      reject(new UploadRequestError('上传失败，请检查网络连接', 0));
    };
    xhr.onabort = () => {
      settle();
      reject(new UploadRequestError(stalled ? '上传超时，网络长时间没有响应' : '上传已取消', 0));
    };

    signal?.addEventListener('abort', onSignalAbort);
    armStallTimer();
    xhr.send(body);
  });
}

export function uploadFormDataWithProgress<T>({
  formData,
  method = 'POST',
  onProgress,
  url
}: UploadFormDataOptions): Promise<T> {
  const startedAt = Date.now();
  return sendWithUploadProgress<T>({
    body: formData,
    method,
    url,
    onUploadProgress: (loaded, total) => {
      if (!onProgress) return;
      const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
      onProgress({
        loaded,
        total,
        percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
        speedBytesPerSecond: loaded / elapsedSeconds
      });
    }
  });
}
