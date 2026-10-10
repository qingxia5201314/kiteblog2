import { createPostQueryService, toCompactPublicPost } from './postQueryService.mjs';

export function createPostService({ store, revisionService }) {
  const queryService = createPostQueryService({ store });

  function recordRevision(post, metadata) {
    revisionService?.snapshot(post, metadata);
    return post;
  }

  return {
    listPosts(options) {
      return store.list(options);
    },
    listPostSummaries(options) {
      return store.list(options).map(toCompactPublicPost);
    },
    queryPublicPosts(searchParams) {
      return queryService.query(searchParams);
    },
    getPost(idOrSlug) {
      return store.get(idOrSlug);
    },
    createPost(draft, { editorUserId = 'admin' } = {}) {
      return recordRevision(store.create(draft), { source: 'create', editorUserId });
    },
    updatePost(id, patch, { editorUserId = 'admin' } = {}) {
      const current = store.get(id);
      const updated = store.update(id, patch);
      if (!updated) return undefined;
      const nextStatus = updated.status;
      const source = current?.status !== 'published' && nextStatus === 'published'
        ? 'publish'
        : current?.status === 'published' && nextStatus !== 'published'
          ? 'withdraw'
          : 'manual-save';
      return recordRevision(updated, {
        source,
        editorUserId,
        isProtected: source === 'publish' || source === 'withdraw'
      });
    },
    removePost(id) {
      return store.remove(id);
    },
    getArticleDraft() {
      return store.getArticleDraft();
    },
    saveArticleDraft(payload) {
      return store.saveArticleDraft(payload);
    },
    clearArticleDraft() {
      return store.clearArticleDraft();
    },
    listComments(idOrSlug) {
      return store.listComments(idOrSlug);
    },
    createComment(idOrSlug, draft, user) {
      return store.createComment(idOrSlug, draft, user);
    },
    updateComment(commentId, patch, user) {
      return store.updateComment(commentId, patch, user);
    },
    removeComment(commentId, user) {
      return store.removeComment(commentId, user);
    }
  };
}
