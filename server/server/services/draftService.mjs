function hasDraftContent(draft) {
  return Boolean(
    String(draft?.title || '').trim() ||
    String(draft?.summary || '').trim() ||
    String(draft?.content || '').trim() ||
    (Array.isArray(draft?.tags) && draft.tags.length > 0) ||
    String(draft?.coverImage || '').trim()
  );
}

function postDraft(draft) {
  return {
    title: String(draft?.title || '').trim() || '未命名草稿',
    summary: String(draft?.summary || '').trim() || '自动保存草稿',
    category: draft?.category || 'life',
    tags: Array.isArray(draft?.tags) ? draft.tags.map(String) : [],
    content: String(draft?.content || ''),
    status: 'draft',
    cover: draft?.cover || draft?.category || 'life',
    coverImage: String(draft?.coverImage || '')
  };
}

function snapshotTimestamp(post) {
  const postTimestamp = Date.parse(post?.updatedAt || '') || 0;
  return new Date(Math.max(Date.now(), postTimestamp + 1)).toISOString();
}

const recoveryFields = ['title', 'summary', 'category', 'tags', 'content', 'status', 'cover', 'coverImage'];

function snapshotDiffersFromPost(snapshot, post) {
  return recoveryFields.some((field) => {
    const draftValue = snapshot.draft?.[field];
    const postValue = post?.[field];
    return Array.isArray(draftValue) || Array.isArray(postValue)
      ? JSON.stringify(draftValue ?? []) !== JSON.stringify(postValue ?? [])
      : String(draftValue ?? '') !== String(postValue ?? '');
  });
}

export function createDraftService({ postStore }) {
  return {
    get() {
      return postStore.getArticleDraft() ?? null;
    },

    getRecovery(postId) {
      const snapshot = postStore.getArticleDraft();
      const post = postStore.get(postId);
      if (!snapshot || !post || snapshot.editingId !== post.id) return null;
      return Date.parse(snapshot.updatedAt) > Date.parse(post.updatedAt) && snapshotDiffersFromPost(snapshot, post)
        ? snapshot
        : null;
    },

    save(payload) {
      const draft = payload?.draft || {};
      let editingId = payload?.editingId ? String(payload.editingId) : null;
      let current = editingId ? postStore.get(editingId) : null;

      if (hasDraftContent(draft) && !current) {
        current = postStore.create(postDraft(draft));
        editingId = current.id;
      } else if (hasDraftContent(draft) && current?.status === 'draft') {
        current = postStore.update(current.id, postDraft(draft));
      }

      return postStore.saveArticleDraft({
        editingId,
        draft,
        updatedAt: snapshotTimestamp(current)
      });
    },

    discard() {
      return postStore.clearArticleDraft();
    }
  };
}
