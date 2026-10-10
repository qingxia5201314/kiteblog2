import { apiFetch } from './apiClient';
import { uploadInChunks } from './chunkedUpload';
import { UploadProgressHandler } from './uploadProgress';

export interface UploadedFile {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  folderId: string;
}

export interface FileLink {
  path: string;
  token?: string;
}

export interface FileFolder {
  id: string;
  name: string;
  parentId: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileFolderView {
  folder: FileFolder | null;
  breadcrumbs: FileFolder[];
  folders: FileFolder[];
  files: UploadedFile[];
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || '请求失败');
  }
  return payload as T;
}

export async function listUploadedFiles(): Promise<UploadedFile[]> {
  return (await getFileFolderView()).files;
}

export async function getFileFolderView(folderId = ''): Promise<FileFolderView> {
  const search = new URLSearchParams();
  if (folderId) search.set('folderId', folderId);
  return parseResponse<FileFolderView>(
    await apiFetch(`/api/files${search.toString() ? `?${search}` : ''}`)
  );
}

export async function uploadFile(
  file: File,
  folderId = '',
  onProgress?: UploadProgressHandler
): Promise<UploadedFile> {
  const payload = await uploadInChunks<{ file: UploadedFile }>({
    endpoint: '/api/files/uploads',
    file,
    fields: folderId ? { folderId } : {},
    onProgress
  });
  return payload.file;
}

export async function createFileFolder(input: { name: string; parentId?: string }): Promise<FileFolder> {
  const payload = await parseResponse<{ folder: FileFolder }>(
    await apiFetch('/api/file-folders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    })
  );
  return payload.folder;
}

export async function renameFileFolder(id: string, name: string): Promise<FileFolder> {
  const payload = await parseResponse<{ folder: FileFolder }>(
    await apiFetch(`/api/file-folders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name })
    })
  );
  return payload.folder;
}

export async function deleteFileFolder(id: string): Promise<void> {
  await parseResponse<{ ok: boolean }>(
    await apiFetch(`/api/file-folders/${encodeURIComponent(id)}`, { method: 'DELETE' })
  );
}

export async function createFileLink(id: string): Promise<FileLink> {
  const payload = await parseResponse<{ link: FileLink }>(
    await apiFetch(`/api/files/${encodeURIComponent(id)}/link`, { method: 'POST' })
  );
  return payload.link;
}

export async function getFilePreviewLink(id: string): Promise<FileLink> {
  const payload = await parseResponse<{ link: FileLink }>(
    await apiFetch(`/api/files/${encodeURIComponent(id)}/preview-link`, { method: 'POST' })
  );
  return payload.link;
}

export async function deleteUploadedFile(id: string): Promise<void> {
  await parseResponse<{ ok: boolean }>(
    await apiFetch(`/api/files/${encodeURIComponent(id)}`, { method: 'DELETE' })
  );
}
