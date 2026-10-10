import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useImages } from '../hooks/useImages';
import { HostedImage, deleteHostedImage, uploadHostedImage } from '../lib/imageApi';
import { formatBytes } from '../components/shared';
import { copyTextToClipboard } from '../lib/clipboard';
import { UploadProgressTip } from '../components/UploadProgressTip';
import { UploadProgress } from '../lib/uploadProgress';

export function ImagesPage() {
  const { notify } = useApp();
  const { hostedImages, uploadingImage, copiedImageLink, setCopiedImageLink, loadHostedImages } = useImages(notify);

  const [imageDragActive, setImageDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadTipHidden, setUploadTipHidden] = useState(true);
  const [uploadingImageName, setUploadingImageName] = useState('');
  const imageHostInputRef = useRef<HTMLInputElement | null>(null);

  const handleHostedImageUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('error', '图床只允许上传图片文件');
      return;
    }
    setUploadingImageName(file.name);
    setUploadProgress({ loaded: 0, total: file.size, percent: 0, speedBytesPerSecond: 0 });
    setUploadTipHidden(false);
    try {
      const image = await uploadHostedImage(file, setUploadProgress);
      const link = new URL(image.path, window.location.origin).toString();
      setCopiedImageLink(link);
      await loadHostedImages();
      const copied = await copyTextToClipboard(link);
      notify('success', copied ? '图片已上传，链接已复制' : '图片已上传，请手动复制链接');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '图片上传失败');
    } finally {
      window.setTimeout(() => {
        setUploadTipHidden(true);
        setUploadProgress(null);
        setUploadingImageName('');
      }, 900);
      if (imageHostInputRef.current) imageHostInputRef.current.value = '';
    }
  };

  const handleCopyHostedImageLink = async (image: HostedImage) => {
    const link = new URL(image.path, window.location.origin).toString();
    setCopiedImageLink(link);
    const copied = await copyTextToClipboard(link);
    notify(copied ? 'success' : 'info', copied ? '图片链接已复制' : '请手动复制图片链接');
  };

  const handleRemoveHostedImage = async (image: HostedImage) => {
    if (!window.confirm(`确认删除 ${image.originalName} 吗？`)) return;
    try {
      await deleteHostedImage(image.id);
      await loadHostedImages();
      if (copiedImageLink.includes(image.id)) setCopiedImageLink('');
      notify('success', '图片已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '图片删除失败');
    }
  };

  return (
    <section className="image-host-page">
      {uploadingImageName ? (
        <UploadProgressTip
          fileName={uploadingImageName}
          hidden={uploadTipHidden}
          onClose={() => setUploadTipHidden(true)}
          progress={uploadProgress}
          title="图床上传"
        />
      ) : null}
      <section className="image-host-layout">
        <div className="file-hero accounting-card">
          <div>
            <p className="eyebrow">Image Host</p>
            <h1>图床</h1>
            <p>上传成功后会立即给出图片链接，可直接粘贴到 Markdown 和网页中使用。</p>
          </div>
          <button onClick={() => loadHostedImages()} type="button">
            刷新列表
          </button>
        </div>

        <section
          className={imageDragActive ? 'image-dropzone active' : 'image-dropzone'}
          onDragLeave={() => setImageDragActive(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setImageDragActive(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setImageDragActive(false);
            void handleHostedImageUpload(event.dataTransfer.files[0]);
          }}
        >
          <input
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(event) => void handleHostedImageUpload(event.target.files?.[0])}
            ref={imageHostInputRef}
            type="file"
          />
          <strong>拖拽图片到这里，或点击选择上传</strong>
          <span>仅支持 PNG、JPG、GIF、WebP。</span>
          <button disabled={uploadingImage} onClick={() => imageHostInputRef.current?.click()} type="button">
            {uploadingImage ? '上传中...' : '选择图片'}
          </button>
        </section>

        {copiedImageLink ? (
          <div className="file-link-box">
            <span>最近上传的图片链接</span>
            <code>{copiedImageLink}</code>
          </div>
        ) : null}

        <section className="accounting-card image-list-panel">
          <div className="panel-heading">
            <h2>图片列表 · {hostedImages.length} 张</h2>
          </div>
          <div className="image-grid">
            {hostedImages.map((image) => {
              const link = new URL(image.path, window.location.origin).toString();
              return (
                <div className="image-item" key={image.id}>
                  <img alt={image.originalName} src={image.path} />
                  <div>
                    <strong>{image.originalName}</strong>
                    <small>
                      {formatBytes(image.sizeBytes)} · {image.contentType}
                    </small>
                    <code>{link}</code>
                  </div>
                  <button onClick={() => void handleCopyHostedImageLink(image)} type="button">
                    复制链接
                  </button>
                  <button className="danger" onClick={() => void handleRemoveHostedImage(image)} type="button">
                    删除
                  </button>
                </div>
              );
            })}
            {hostedImages.length === 0 ? <div className="empty-state">还没有上传图片。</div> : null}
          </div>
        </section>
      </section>
    </section>
  );
}
