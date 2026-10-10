interface ArticlePreviewActionProps {
  editingId: string | null;
  disabled?: boolean;
  onFlush: () => Promise<unknown>;
}

export function ArticlePreviewAction({ editingId, disabled, onFlush }: ArticlePreviewActionProps) {
  const openPreview = async () => {
    const snapshot = await onFlush();
    const previewId = editingId || (snapshot && typeof snapshot === 'object' && 'editingId' in snapshot
      ? String(snapshot.editingId || '')
      : '');
    if (previewId) window.open(`/admin/preview/${encodeURIComponent(previewId)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <button disabled={disabled} onClick={() => void openPreview()} type="button">
      预览文章
    </button>
  );
}
