import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_EXPIRED_EVENT } from './apiClient';
import { uploadFormDataWithProgress } from './uploadProgress';

class FakeUploadTarget {
  onprogress: ((event: ProgressEvent) => void) | null = null;
}

class FakeXMLHttpRequest {
  static latest: FakeXMLHttpRequest | null = null;

  method = '';
  requestHeaders: Record<string, string> = {};
  responseText = '';
  status = 0;
  upload = new FakeUploadTarget();
  url = '';
  withCredentials = false;
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  sentBody: FormData | null = null;

  constructor() {
    FakeXMLHttpRequest.latest = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.requestHeaders[name] = value;
  }

  send(body: FormData) {
    this.sentBody = body;
  }
}

describe('upload progress helper', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    FakeXMLHttpRequest.latest = null;
  });

  it('uploads form data through XHR and reports percent with speed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T00:00:00.000Z'));
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const onProgress = vi.fn();
    const formData = new FormData();
    formData.set('file', new File(['payload'], 'note.txt', { type: 'text/plain' }));

    const resultPromise = uploadFormDataWithProgress<{ file: { id: string } }>({
      formData,
      onProgress,
      url: '/api/files'
    });
    const xhr = FakeXMLHttpRequest.latest!;

    vi.setSystemTime(new Date('2026-06-26T00:00:02.000Z'));
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 512, total: 1024 } as ProgressEvent);
    xhr.status = 200;
    xhr.responseText = JSON.stringify({ file: { id: 'file-1' } });
    xhr.onload?.();

    await expect(resultPromise).resolves.toEqual({ file: { id: 'file-1' } });
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/files');
    expect(xhr.withCredentials).toBe(true);
    expect(JSON.stringify(xhr.requestHeaders)).not.toContain('Authorization');
    expect(JSON.stringify(xhr.requestHeaders)).not.toContain('Bearer');
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      loaded: 512,
      total: 1024,
      percent: 50,
      speedBytesPerSecond: 256
    }));
  });

  it('uses server messages for failed uploads', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const formData = new FormData();
    formData.set('file', new File(['payload'], 'note.txt', { type: 'text/plain' }));

    const resultPromise = uploadFormDataWithProgress<{ file: { id: string } }>({
      formData,
      url: '/api/files'
    });
    const xhr = FakeXMLHttpRequest.latest!;

    xhr.status = 413;
    xhr.responseText = JSON.stringify({ message: '文件太大' });
    xhr.onload?.();

    await expect(resultPromise).rejects.toThrow('文件太大');
  });

  it.each([
    [502, '<html><body>Bad gateway</body></html>', '上传失败（HTTP 502）'],
    [413, '<html>413 Request Entity Too Large</html>', '文件超过了服务器允许的单次请求大小（HTTP 413）'],
    [200, '<html>Unexpected page</html>', '服务器返回了无法识别的响应']
  ])('reports a readable error for HTTP %s with a non-JSON body', async (status, responseText, message) => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const resultPromise = uploadFormDataWithProgress({ formData: new FormData(), url: '/api/files' });
    const xhr = FakeXMLHttpRequest.latest!;

    xhr.status = status;
    xhr.responseText = responseText;
    xhr.onload?.();

    await expect(resultPromise).rejects.toThrow(message);
  });

  it.each([
    ['an empty response', ''],
    ['an HTML response', '<html>Session expired</html>'],
    ['invalid JSON', '{not-json']
  ])('broadcasts auth expiry exactly once for a 401 with %s', async (_label, responseText) => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const listener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);
    const resultPromise = uploadFormDataWithProgress({
      formData: new FormData(),
      url: '/api/files'
    });
    const xhr = FakeXMLHttpRequest.latest!;

    try {
      xhr.status = 401;
      xhr.responseText = responseText;
      xhr.onload?.();

      await expect(resultPromise).rejects.toBeInstanceOf(Error);
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
    }
  });

  it('rejects with a stable message after an XHR network error', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const resultPromise = uploadFormDataWithProgress({
      formData: new FormData(),
      url: '/api/files'
    });

    FakeXMLHttpRequest.latest!.onerror?.();

    await expect(resultPromise).rejects.toThrow('上传失败，请检查网络连接');
  });

  it('rejects with a stable message after an XHR abort', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const resultPromise = uploadFormDataWithProgress({
      formData: new FormData(),
      url: '/api/files'
    });

    FakeXMLHttpRequest.latest!.onabort?.();

    await expect(resultPromise).rejects.toThrow('上传已取消');
  });
});
