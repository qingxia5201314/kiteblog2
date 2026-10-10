import { ClipboardEvent, KeyboardEvent, useRef, useState } from 'react';
import { uploadHostedImage } from '../../../lib/imageApi';
import { createMarkdownImageBlock, getFirstClipboardImage, insertAtSelection } from '../../../lib/markdownInsert';
import { applyMarkdownIndent } from '../markdownIndent';

type EditorPatch = { content?: string; coverImage?: string };
type Notify = (type: 'success' | 'error' | 'info', message: string) => void;

interface UseMarkdownEditorOptions {
  content: string;
  updateForm: (patch: EditorPatch) => void;
  notify: Notify;
}

export function useMarkdownEditor({ content, updateForm, notify }: UseMarkdownEditorOptions) {
  const [uploadingImage, setUploadingImage] = useState(false);
  const contentEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const coverImageInputRef = useRef<HTMLInputElement | null>(null);

  const restoreSelection = (selectionStart: number, selectionEnd = selectionStart) => {
    window.setTimeout(() => {
      contentEditorRef.current?.focus();
      contentEditorRef.current?.setSelectionRange(selectionStart, selectionEnd);
    }, 0);
  };

  const insertMarkdownAtEditor = (snippet: string, selectionStart?: number, selectionEnd?: number) => {
    const editor = contentEditorRef.current;
    const source = editor?.value ?? content;
    const start = selectionStart ?? editor?.selectionStart ?? source.length;
    const end = selectionEnd ?? editor?.selectionEnd ?? start;
    const next = insertAtSelection(source, snippet, start, end);
    updateForm({ content: next.value });
    restoreSelection(next.cursor);
  };

  const insertMarkdownSnippet = (before: string, after = '', placeholder = '内容') => {
    insertMarkdownAtEditor(`${before}${placeholder}${after}`);
    notify('info', '已插入 Markdown 片段');
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const next = applyMarkdownIndent(
      event.currentTarget.value,
      event.currentTarget.selectionStart,
      event.currentTarget.selectionEnd,
      event.shiftKey
    );
    updateForm({ content: next.value });
    restoreSelection(next.selectionStart, next.selectionEnd);
  };

  const insertImageFile = async (file?: File, selectionStart?: number, selectionEnd?: number) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return notify('error', '只能上传图片文件');
    setUploadingImage(true);
    try {
      const image = await uploadHostedImage(file);
      insertMarkdownAtEditor(createMarkdownImageBlock(image.originalName, image.path), selectionStart, selectionEnd);
      notify('success', '图片已上传并插入正文');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '图片上传失败');
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const uploadCoverImageFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return notify('error', '只能上传图片文件');
    setUploadingImage(true);
    try {
      const image = await uploadHostedImage(file);
      updateForm({ coverImage: image.path });
      notify('success', '封面已上传并填入');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '封面上传失败');
    } finally {
      setUploadingImage(false);
      if (coverImageInputRef.current) coverImageInputRef.current.value = '';
    }
  };

  const pasteImageIntoEditor = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const image = getFirstClipboardImage(event.clipboardData.items);
    if (!image) return;
    const start = event.currentTarget.selectionStart;
    const end = event.currentTarget.selectionEnd;
    event.preventDefault();
    void insertImageFile(image, start, end);
  };

  return {
    contentEditorRef,
    imageInputRef,
    coverImageInputRef,
    uploadingImage,
    insertMarkdownSnippet,
    insertImageFile,
    uploadCoverImageFile,
    pasteImageIntoEditor,
    handleEditorKeyDown
  };
}
