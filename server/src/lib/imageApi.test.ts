import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteHostedImage, listHostedImages, uploadHostedImage } from './imageApi';
import { uploadFormDataWithProgress } from './uploadProgress';

vi.mock('./uploadProgress', () => ({
  uploadFormDataWithProgress: vi.fn()
}));

const hostedImage = {
  id: 'img-1',
  originalName: 'pasted.png',
  contentType: 'image/png',
  sizeBytes: 3,
  uploadedAt: '2026-06-26T00:00:00.000Z',
  path: '/api/images/raw/img-1'
};

describe('image api client', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses same-origin cookies for image operations', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({
      images: [],
      image: hostedImage,
      ok: true
    })));
    vi.stubGlobal('fetch', fetchMock);

    await listHostedImages();
    await uploadHostedImage(new File(['png'], 'pasted.png', { type: 'image/png' }));
    await deleteHostedImage('img-1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/images', { credentials: 'same-origin' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/images', {
      method: 'POST',
      credentials: 'same-origin',
      body: expect.any(FormData)
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/images/img-1', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Authorization');
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Bearer');
  });

  it('turns html error pages into readable upload errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () => '<html><body>Request too large</body></html>'
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      uploadHostedImage(new File(['png'], 'pasted.png', { type: 'image/png' }))
    ).rejects.toThrow('图片上传失败：服务器返回了 HTML 页面（HTTP 413）');
  });

  it('uses the cookie-authenticated progress uploader without auth headers', async () => {
    vi.mocked(uploadFormDataWithProgress).mockResolvedValue({ image: hostedImage });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ image: hostedImage })));
    const onProgress = vi.fn();

    const image = await uploadHostedImage(
      new File(['png'], 'pasted.png', { type: 'image/png' }),
      onProgress
    );

    expect(image.id).toBe('img-1');
    expect(uploadFormDataWithProgress).toHaveBeenCalledWith(expect.objectContaining({
      onProgress,
      url: '/api/images'
    }));
    expect(vi.mocked(uploadFormDataWithProgress).mock.calls[0][0]).not.toHaveProperty('headers');
    expect(vi.mocked(uploadFormDataWithProgress).mock.calls[0][0].formData.get('file')).toBeInstanceOf(File);
    expect(JSON.stringify(vi.mocked(uploadFormDataWithProgress).mock.calls)).not.toContain('Authorization');
    expect(JSON.stringify(vi.mocked(uploadFormDataWithProgress).mock.calls)).not.toContain('Bearer');
  });
});
