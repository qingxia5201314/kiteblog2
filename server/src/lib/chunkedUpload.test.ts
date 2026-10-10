import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadInChunks } from './chunkedUpload';

type FakeReply = { status: number; body: string } | 'network-error';

class FakeXMLHttpRequest {
  static requests: FakeXMLHttpRequest[] = [];
  static active = 0;
  static maxActive = 0;
  static reply: (request: FakeXMLHttpRequest) => FakeReply = () => ({ status: 200, body: '{"ok":true}' });

  method = '';
  url = '';
  requestHeaders: Record<string, string> = {};
  body: Blob | null = null;
  status = 0;
  responseText = '';
  withCredentials = false;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private done = false;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.requestHeaders[name] = value;
  }

  send(body: Blob) {
    this.body = body;
    FakeXMLHttpRequest.requests.push(this);
    FakeXMLHttpRequest.active += 1;
    FakeXMLHttpRequest.maxActive = Math.max(FakeXMLHttpRequest.maxActive, FakeXMLHttpRequest.active);
    setTimeout(() => {
      if (this.done) return;
      this.upload.onprogress?.({ lengthComputable: true, loaded: Math.floor(body.size / 2), total: body.size } as ProgressEvent);
      setTimeout(() => this.finish(FakeXMLHttpRequest.reply(this)), 0);
    }, 0);
  }

  abort() {
    if (this.done) return;
    this.done = true;
    FakeXMLHttpRequest.active -= 1;
    this.onabort?.();
  }

  private finish(reply: FakeReply) {
    if (this.done) return;
    this.done = true;
    FakeXMLHttpRequest.active -= 1;
    if (reply === 'network-error') {
      this.onerror?.();
      return;
    }
    this.status = reply.status;
    this.responseText = reply.body;
    this.onload?.();
  }
}

const session = { id: 'upload-1', chunkSize: 4, chunkCount: 3, receivedChunks: [] };

function mockServer(overrides: Partial<Record<'create' | 'complete', () => Response>> = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/files/uploads' && init?.method === 'POST') {
      return overrides.create?.() ?? Response.json({ upload: session }, { status: 201 });
    }
    if (url === '/api/files/uploads/upload-1/complete') {
      return overrides.complete?.() ?? Response.json({ file: { id: 'file-1' } }, { status: 201 });
    }
    if (url === '/api/files/uploads/upload-1' && init?.method === 'DELETE') return Response.json({ ok: true });
    return Response.json({ ok: false, message: 'unexpected' }, { status: 500 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function chunkRequests(index: number) {
  return FakeXMLHttpRequest.requests.filter((request) => request.url.endsWith(`/chunks/${index}`));
}

const file = new File(['0123456789'], 'movie.mp4', { type: 'video/mp4' });

describe('chunked uploads', () => {
  beforeEach(() => {
    FakeXMLHttpRequest.requests = [];
    FakeXMLHttpRequest.active = 0;
    FakeXMLHttpRequest.maxActive = 0;
    FakeXMLHttpRequest.reply = () => ({ status: 200, body: '{"ok":true}' });
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uploads every slice with bounded concurrency, then completes the session', async () => {
    const fetchMock = mockServer();
    const onProgress = vi.fn();

    const payload = await uploadInChunks<{ file: { id: string } }>({
      endpoint: '/api/files/uploads',
      file,
      fields: { folderId: 'folder-1' },
      onProgress,
      concurrency: 2
    });

    expect(payload).toEqual({ file: { id: 'file-1' } });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      folderId: 'folder-1',
      fileName: 'movie.mp4',
      contentType: 'video/mp4',
      sizeBytes: 10
    });
    const slices = await Promise.all([0, 1, 2].map((index) => readBlob(chunkRequests(index)[0].body!)));
    expect(slices).toEqual(['0123', '4567', '89']);
    FakeXMLHttpRequest.requests.forEach((request) => {
      expect(request.method).toBe('PUT');
      expect(request.withCredentials).toBe(true);
      expect(request.requestHeaders).toEqual({ 'content-type': 'application/octet-stream' });
    });
    expect(FakeXMLHttpRequest.maxActive).toBe(2);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/files/uploads/upload-1/complete', {
      method: 'POST',
      credentials: 'same-origin'
    });
    const percents = onProgress.mock.calls.map(([progress]) => progress.percent);
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ loaded: 10, total: 10, percent: 100 }));
    expect(percents.every((percent) => Number.isInteger(percent))).toBe(true);
  });

  it('retries transient chunk failures such as proxy error pages and dropped connections', async () => {
    const fetchMock = mockServer();
    const failures = new Map<string, FakeReply>([
      ['/api/files/uploads/upload-1/chunks/1', { status: 502, body: '<html>Bad gateway</html>' }],
      ['/api/files/uploads/upload-1/chunks/2', 'network-error']
    ]);
    FakeXMLHttpRequest.reply = (request) => {
      const failure = failures.get(request.url);
      failures.delete(request.url);
      return failure ?? { status: 200, body: '{"ok":true}' };
    };

    await expect(uploadInChunks({ endpoint: '/api/files/uploads', file, retryDelayMs: 1 })).resolves.toEqual({
      file: { id: 'file-1' }
    });

    expect(chunkRequests(0)).toHaveLength(1);
    expect(chunkRequests(1)).toHaveLength(2);
    expect(chunkRequests(2)).toHaveLength(2);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });

  it('gives up after the retry budget and cancels the server session', async () => {
    const fetchMock = mockServer();
    FakeXMLHttpRequest.reply = () => 'network-error';

    await expect(
      uploadInChunks({ endpoint: '/api/files/uploads', file, maxAttempts: 3, retryDelayMs: 1 })
    ).rejects.toThrow('上传失败，请检查网络连接');

    expect(chunkRequests(0)).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith('/api/files/uploads/upload-1', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/complete'))).toBe(false);
  });

  it('stops immediately on non-retryable chunk errors and reports the server message', async () => {
    mockServer();
    FakeXMLHttpRequest.reply = (request) =>
      request.url.endsWith('/chunks/1')
        ? { status: 400, body: JSON.stringify({ ok: false, message: 'Chunk is incomplete' }) }
        : { status: 200, body: '{"ok":true}' };

    await expect(uploadInChunks({ endpoint: '/api/files/uploads', file, retryDelayMs: 1 })).rejects.toThrow(
      'Chunk is incomplete'
    );
    expect(chunkRequests(1)).toHaveLength(1);
  });

  it('turns proxy HTML error pages into readable messages', async () => {
    mockServer({
      create: () => new Response('<html>413 Request Entity Too Large</html>', {
        status: 413,
        headers: { 'content-type': 'text/html' }
      })
    });

    await expect(uploadInChunks({ endpoint: '/api/files/uploads', file })).rejects.toThrow(
      '文件超过了服务器允许的单次请求大小（HTTP 413）'
    );
    expect(FakeXMLHttpRequest.requests).toHaveLength(0);
  });

  it('retries completion when the proxy times out', async () => {
    let completeAttempts = 0;
    mockServer({
      complete: () => {
        completeAttempts += 1;
        return completeAttempts === 1
          ? new Response('<html>524</html>', { status: 524 })
          : Response.json({ file: { id: 'file-1' } }, { status: 201 });
      }
    });

    await expect(uploadInChunks({ endpoint: '/api/files/uploads', file, retryDelayMs: 1 })).resolves.toEqual({
      file: { id: 'file-1' }
    });
    expect(completeAttempts).toBe(2);
  });
});
