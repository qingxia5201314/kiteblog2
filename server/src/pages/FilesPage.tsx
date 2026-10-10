import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useFiles } from '../hooks/useFiles';
import {
  FileFolder,
  UploadedFile,
  createFileFolder,
  createFileLink,
  deleteFileFolder,
  deleteUploadedFile,
  getFilePreviewLink,
  renameFileFolder,
  uploadFile
} from '../lib/fileApi';
import { formatBytes } from '../components/shared';
import { UploadProgressTip } from '../components/UploadProgressTip';
import { UploadProgress } from '../lib/uploadProgress';
import { copyTextToClipboard } from '../lib/clipboard';

function isMediaFile(file: UploadedFile) {
  return file.contentType.startsWith('video/') || file.contentType.startsWith('audio/');
}

export function FilesPage() {
  const navigate = useNavigate();
  const { notify } = useApp();
  const {
    activeFileFolderId,
    fileFolderView,
    uploadingFile,
    generatedFileLink,
    setGeneratedFileLink,
    loadFiles,
    openFolder
  } = useFiles(notify);

  const [fileDragActive, setFileDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadTipHidden, setUploadTipHidden] = useState(true);
  const [uploadingFileName, setUploadingFileName] = useState('');
  const [generatedLinkIsMedia, setGeneratedLinkIsMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUploadWrapper = async (file?: File) => {
    if (!file) return;
    setUploadingFileName(file.name);
    setUploadProgress({ loaded: 0, total: file.size, percent: 0, speedBytesPerSecond: 0 });
    setUploadTipHidden(false);
    try {
      await uploadFile(file, activeFileFolderId, setUploadProgress);
      await loadFiles(activeFileFolderId);
      notify('success', '文件已上传');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件上传失败');
    } finally {
      window.setTimeout(() => {
        setUploadTipHidden(true);
        setUploadProgress(null);
        setUploadingFileName('');
      }, 900);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCopyFileLink = async (file: UploadedFile) => {
    try {
      const link = await createFileLink(file.id);
      const absoluteLink = new URL(link.path, window.location.origin).toString();
      setGeneratedFileLink(absoluteLink);
      setGeneratedLinkIsMedia(isMediaFile(file));
      await copyTextToClipboard(absoluteLink);
      notify('success', isMediaFile(file) ? '永久媒体链接已复制' : '签名链接已复制');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '生成链接失败');
    }
  };

  const handlePreviewFile = async (file: UploadedFile) => {
    if (!isMediaFile(file)) {
      notify('info', '当前只提供音视频站内预览');
      return;
    }

    try {
      const link = await getFilePreviewLink(file.id);
      navigate('/files/preview', {
        state: {
          url: new URL(link.path, window.location.origin).toString(),
          originalName: file.originalName,
          contentType: file.contentType
        }
      });
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '预览链接生成失败');
    }
  };

  const handleRemoveFile = async (file: UploadedFile) => {
    const confirmed = window.confirm(
      `确认删除 ${file.originalName} 吗？删除后${isMediaFile(file) ? '永久媒体链接' : '签名链接'}会立刻失效。`
    );
    if (!confirmed) return;

    try {
      await deleteUploadedFile(file.id);
      await loadFiles(activeFileFolderId);
      setGeneratedFileLink('');
      setGeneratedLinkIsMedia(false);
      notify('success', '文件已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文件删除失败');
    }
  };

  const handleOpenFolder = (folderId = '') => {
    setGeneratedFileLink('');
    setGeneratedLinkIsMedia(false);
    openFolder(folderId);
  };

  const handleCreateFolder = async () => {
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

  const handleRenameFolder = async (folder: FileFolder) => {
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

  const handleRemoveFolder = async (folder: FileFolder) => {
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

  return (
    <section className="files-page">
      {uploadingFileName ? (
        <UploadProgressTip
          fileName={uploadingFileName}
          hidden={uploadTipHidden}
          onClose={() => setUploadTipHidden(true)}
          progress={uploadProgress}
          title="文件上传"
        />
      ) : null}
      <section className="files-layout">
        <div className="file-hero accounting-card">
          <div>
            <p className="eyebrow">Signed Storage</p>
            <h1>文件仓库</h1>
            <p>音视频提供保留原始后缀的永久公开链接，其他文件通过签名链接访问。</p>
          </div>
          <button onClick={() => loadFiles(activeFileFolderId)} type="button">
            刷新列表
          </button>
        </div>

        <section className="file-toolbar accounting-card">
          <div className="file-breadcrumbs" aria-label="文件夹路径">
            <button className={!activeFileFolderId ? 'active' : ''} onClick={() => handleOpenFolder('')} type="button">
              根目录
            </button>
            {fileFolderView.breadcrumbs.map((folder) => (
              <button
                className={folder.id === activeFileFolderId ? 'active' : ''}
                key={folder.id}
                onClick={() => handleOpenFolder(folder.id)}
                type="button"
              >
                {folder.name}
              </button>
            ))}
          </div>
          <button onClick={handleCreateFolder} type="button">
            新建文件夹
          </button>
        </section>

        {fileFolderView.folders.length ? (
          <section className="folder-grid" aria-label="文件夹">
            {fileFolderView.folders.map((folder) => (
              <div className="folder-item" key={folder.id}>
                <button className="folder-open" onClick={() => handleOpenFolder(folder.id)} type="button">
                  <span className="folder-icon">DIR</span>
                  <span>
                    <strong>{folder.name}</strong>
                    <small>{new Date(folder.updatedAt).toLocaleString('zh-CN')}</small>
                  </span>
                </button>
                <div>
                  <button onClick={() => handleRenameFolder(folder)} type="button">
                    重命名
                  </button>
                  <button className="danger" onClick={() => handleRemoveFolder(folder)} type="button">
                    删除
                  </button>
                </div>
              </div>
            ))}
          </section>
        ) : null}

        <section
          className={fileDragActive ? 'file-dropzone active' : 'file-dropzone'}
          onDragLeave={() => setFileDragActive(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setFileDragActive(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setFileDragActive(false);
            void handleFileUploadWrapper(event.dataTransfer.files[0]);
          }}
        >
          <input onChange={(event) => void handleFileUploadWrapper(event.target.files?.[0])} ref={fileInputRef} type="file" />
          <strong>拖拽文件到这里，或点击选择上传</strong>
          <span>文件仓库默认不限制大小，大文件会自动分片并行上传，网络抖动时分片会自动重试。</span>
          <button disabled={uploadingFile} onClick={() => fileInputRef.current?.click()} type="button">
            {uploadingFile ? '上传中...' : '选择文件'}
          </button>
        </section>

        {generatedFileLink ? (
          <div className="file-link-box">
            <span>{generatedLinkIsMedia ? '最近生成的永久媒体链接' : '最近生成的签名链接'}</span>
            <code>{generatedFileLink}</code>
          </div>
        ) : null}

        <section className="accounting-card file-list-panel">
          <div className="panel-heading">
            <h2>当前目录文件 · {fileFolderView.files.length} 个</h2>
          </div>
          <div className="file-list">
            {fileFolderView.files.map((file) => (
              <div className="file-item" key={file.id}>
                <span className="file-badge">FILE</span>
                <span>
                  <strong>{file.originalName}</strong>
                  <small>
                    {formatBytes(file.sizeBytes)} · {file.contentType} · {new Date(file.uploadedAt).toLocaleString('zh-CN')}
                  </small>
                </span>
                <button onClick={() => void handleCopyFileLink(file)} type="button">
                  复制链接
                </button>
                <button className="ghost" onClick={() => void handlePreviewFile(file)} type="button">
                  预览
                </button>
                <button className="danger" onClick={() => void handleRemoveFile(file)} type="button">
                  删除
                </button>
              </div>
            ))}
            {fileFolderView.files.length === 0 ? <div className="empty-state">这个目录还没有文件。</div> : null}
          </div>
        </section>
      </section>
    </section>
  );
}
