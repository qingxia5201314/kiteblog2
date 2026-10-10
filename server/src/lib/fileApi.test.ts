import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFileFolder,
  createFileLink,
  deleteFileFolder,
  deleteUploadedFile,
  getFileFolderView,
  getFilePreviewLink,
  listUploadedFiles,
  renameFileFolder,
  uploadFile
} from './fileApi';
import { uploadInChunks } from './chunkedUpload';

vi.mock('./chunkedUpload', () => ({
  uploadInChunks: vi.fn()
}));

const uploadedFile = {
  id: 'file-1',
  originalName: 'rfi.txt',
  contentType: 'text/plain',
  sizeBytes: 7,
  uploadedAt: '2026-06-26T00:00:00.000Z',
  folderId: 'folder-root'
};

describe('file api client', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses same-origin cookies for file operations', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({
      folder: { id: 'folder-1', name: 'RFI' },
      breadcrumbs: [],
      folders: [],
      files: [],
      file: uploadedFile,
      link: { path: '/api/files/raw/file-1.mp4' },
      ok: true
    })));
    vi.stubGlobal('fetch', fetchMock);

    await getFileFolderView('folder-root');
    await listUploadedFiles();
    const fileLink = await createFileLink('file-1');
    const previewLink = await getFilePreviewLink('file-1');
    await deleteUploadedFile('file-1');
    await createFileFolder({ name: 'RFI', parentId: 'folder-root' });
    await renameFileFolder('folder-1', 'SRC');
    await deleteFileFolder('folder-1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/files?folderId=folder-root', { credentials: 'same-origin' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/files', { credentials: 'same-origin' });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/files/file-1/link', {
      method: 'POST',
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/files/file-1/preview-link', {
      method: 'POST',
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/files/file-1', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/file-folders', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'RFI', parentId: 'folder-root' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(7, '/api/file-folders/folder-1', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'SRC' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(8, '/api/file-folders/folder-1', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Authorization');
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Bearer');
    expect(fileLink).toEqual({ path: '/api/files/raw/file-1.mp4' });
    expect(previewLink).toEqual({ path: '/api/files/raw/file-1.mp4' });
  });

  it('uploads files through the chunked uploader with the target folder', async () => {
    vi.mocked(uploadInChunks).mockResolvedValue({ file: uploadedFile });
    const onProgress = vi.fn();
    const inputFile = new File(['payload'], 'rfi.txt', { type: 'text/plain' });

    const file = await uploadFile(inputFile, 'folder-root', onProgress);
    await uploadFile(inputFile);

    expect(file.id).toBe('file-1');
    expect(uploadInChunks).toHaveBeenNthCalledWith(1, {
      endpoint: '/api/files/uploads',
      file: inputFile,
      fields: { folderId: 'folder-root' },
      onProgress
    });
    expect(uploadInChunks).toHaveBeenNthCalledWith(2, expect.objectContaining({ fields: {} }));
  });
});
