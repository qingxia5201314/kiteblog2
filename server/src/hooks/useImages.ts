import { useCallback, useEffect, useState } from 'react';
import { HostedImage, deleteHostedImage, listHostedImages, uploadHostedImage } from '../lib/imageApi';
import { copyTextToClipboard } from '../lib/clipboard';
import { NotificationType } from '../lib/notification';

type NotifyFn = (type: NotificationType, message: string, durationMs?: number) => void;

export function useImages(notify: NotifyFn) {
  const [hostedImages, setHostedImages] = useState<HostedImage[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [copiedImageLink, setCopiedImageLink] = useState('');

  const loadHostedImages = useCallback(async () => {
    try {
      setHostedImages(await listHostedImages());
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '图床列表加载失败');
    }
  }, [notify]);

  useEffect(() => {
    void loadHostedImages();
  }, [loadHostedImages]);

  const handleHostedImageUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('error', '图床只允许上传图片文件');
      return;
    }

    setUploadingImage(true);
    setCopiedImageLink('');
    try {
      const image = await uploadHostedImage(file);
      const link = new URL(image.path, window.location.origin).toString();
      setCopiedImageLink(link);
      await loadHostedImages();
      const copied = await copyTextToClipboard(link);
      notify('success', copied ? '图片已上传，链接已复制' : '图片已上传，请手动复制链接');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '图片上传失败');
    } finally {
      setUploadingImage(false);
    }
  };

  const copyLink = async (image: HostedImage) => {
    const link = new URL(image.path, window.location.origin).toString();
    setCopiedImageLink(link);
    const copied = await copyTextToClipboard(link);
    notify(copied ? 'success' : 'info', copied ? '图片链接已复制' : '请手动复制图片链接');
  };

  const remove = async (image: HostedImage) => {
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

  return {
    // Image list
    hostedImages,
    loadHostedImages,

    // Upload operations
    handleHostedImageUpload,
    copyLink,
    remove,

    // UI state
    uploadingImage,
    imageDragActive,
    setImageDragActive,
    copiedImageLink,
    setCopiedImageLink
  };
}
