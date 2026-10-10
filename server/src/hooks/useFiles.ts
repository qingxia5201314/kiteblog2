import { useCallback, useEffect, useState } from 'react';
import {
  FileFolder,
  FileFolderView,
  UploadedFile,
  createFileFolder,
  createFileLink,
  deleteFileFolder,
  deleteUploadedFile,
  getFileFolderView,
  renameFileFolder,
  uploadFile
} from '../lib/fileApi';
import { copyTextToClipboard } from '../lib/clipboard';
import { NotificationType } from '../lib/notification';

type NotifyFn = (type: NotificationType, message: string, durationMs?: number) => void;

const EMPTY_FILE_FOLDER_VIEW: FileFolderView = {
  folder: null,
  breadcrumbs: [],
  folders: [],
  files: []
};

export function useFiles(notify: NotifyFn) {
  const [activeFileFolderId, setActiveFileFolderId] = useState('');
  const [fileFolderView, setFileFolderView] = useState<FileFolderView>(EMPTY_FILE_FOLDER_VIEW);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileDragActive, setFileDragActive] = useState(false);
  const [generatedFileLink, setGeneratedFileLink] = useState('');

  const loadFiles = useCallback(async (folderId = activeFileFolderId) => {
    try {
      setFileFolderView(await getFileFolderView(folderId));
      setActiveFileFolderId(folderId);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件列表加载失败');
    }
  }, [activeFileFolderId, notify]);

  useEffect(() => {
    void loadFiles(activeFileFolderId);
  }, [activeFileFolderId, loadFiles]);

  const openFolder = (folderId = '') => {
    setGeneratedFileLink('');
    setActiveFileFolderId(folderId);
  };

  const handleFileUpload = async (file?: File) => {
    if (!file) return;
    setUploadingFile(true);
    setGeneratedFileLink('');

    try {
      await uploadFile(file, activeFileFolderId);
      await loadFiles(activeFileFolderId);
      notify('success', '文件已上传');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件上传失败');
    } finally {
      setUploadingFile(false);
    }
  };

  const copyFileLink = async (file: UploadedFile) => {
    try {
      const link = await createFileLink(file.id);
      const absoluteLink = new URL(link.path, window.location.origin).toString();
      setGeneratedFileLink(absoluteLink);
      const copied = await copyTextToClipboard(absoluteLink);
      notify('success', copied ? '签名链接已复制' : '签名链接已生成，请手动复制');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '生成链接失败');
    }
  };

  const remove = async (file: UploadedFile) => {
    const confirmed = window.confirm(`确认删除 ${file.originalName} 吗？删除后签名链接会立即失效。`);
    if (!confirmed) return;

    try {
      await deleteUploadedFile(file.id);
      await loadFiles(activeFileFolderId);
      setGeneratedFileLink('');
      notify('success', '文件已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件删除失败');
    }
  };

  const createFolder = async () => {
    const name = window.prompt('文件夹名称');
    if (!name?.trim()) return;

    try {
      await createFileFolder({ name: name.trim(), parentId: activeFileFolderId });
      await loadFiles(activeFileFolderId);
      notify('success', '文件夹已创建');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件夹创建失败');
    }
  };

  const renameFolder = async (folder: FileFolder) => {
    const name = window.prompt('新的文件夹名称', folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;

    try {
      await renameFileFolder(folder.id, name.trim());
      await loadFiles(activeFileFolderId);
      notify('success', '文件夹已重命名');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件夹重命名失败');
    }
  };

  const removeFolder = async (folder: FileFolder) => {
    const confirmed = window.confirm(`确认删除空文件夹 ${folder.name} 吗？非空文件夹不会被删除。`);
    if (!confirmed) return;

    try {
      await deleteFileFolder(folder.id);
      await loadFiles(activeFileFolderId);
      notify('success', '文件夹已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件夹删除失败');
    }
  };

  return {
    // Folder state
    activeFileFolderId,
    fileFolderView,
    loadFiles,
    openFolder,

    // File operations
    handleFileUpload,
    copyFileLink,
    remove,

    // Folder operations
    createFolder,
    renameFolder,
    removeFolder,

    // UI state
    uploadingFile,
    fileDragActive,
    setFileDragActive,
    generatedFileLink,
    setGeneratedFileLink
  };
}
