const comparableFields = ['title', 'summary', 'content', 'category', 'tags', 'cover', 'coverImage', 'status'];

function comparableValue(value) {
  return Array.isArray(value) ? JSON.stringify(value) : String(value ?? '');
}

function revisionPatch(revision) {
  return {
    title: revision.title,
    summary: revision.summary,
    content: revision.content,
    category: revision.category,
    tags: revision.tags,
    cover: revision.cover,
    coverImage: revision.coverImage,
    status: 'draft'
  };
}

export function createPostRevisionService({ database, postStore, revisionStore }) {
  return {
    snapshot(post, metadata) {
      if (!post) throw new Error('Post not found');
      return revisionStore.create({ post, ...metadata });
    },

    list(postId) {
      if (!postStore.get(postId)) throw new Error('Post not found');
      return revisionStore.list(postId);
    },

    get(postId, revisionId) {
      const revision = revisionStore.get(revisionId);
      if (!revision || revision.postId !== postId) throw new Error('Revision not found');
      return revision;
    },

    compare(postId, revisionId) {
      const current = postStore.get(postId);
      if (!current) throw new Error('Post not found');
      const revision = revisionStore.get(revisionId);
      if (!revision) throw new Error('Revision not found');
      if (revision.postId !== postId) throw new Error('Revision does not belong to this post');
      const changes = comparableFields
        .filter((field) => comparableValue(current[field]) !== comparableValue(revision[field]))
        .map((field) => ({ field, current: current[field], revision: revision[field] }));
      return { current, revision, changes };
    },

    restore(postId, revisionId, { editorUserId = '' } = {}) {
      const current = postStore.get(postId);
      if (!current) throw new Error('Post not found');
      const revision = revisionStore.get(revisionId);
      if (!revision) throw new Error('Revision not found');
      if (revision.postId !== postId) throw new Error('Revision does not belong to this post');

      return database.transaction(() => {
        revisionStore.create({ post: current, source: 'restore-backup', editorUserId, isProtected: true });
        const restored = postStore.update(postId, revisionPatch(revision));
        revisionStore.create({ post: restored, source: 'restore', editorUserId, isProtected: true });
        return restored;
      });
    },

    remove(revisionId) {
      return revisionStore.remove(revisionId);
    }
  };
}
