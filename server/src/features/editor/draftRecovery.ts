import { ArticleAutosaveDraft, BlogPost, BlogPostDraft } from '../../lib/blog';

const draftFields: Array<keyof BlogPostDraft> = [
  'title', 'summary', 'category', 'tags', 'content', 'status', 'cover', 'coverImage'
];

function normalized(value: unknown) {
  return Array.isArray(value) ? JSON.stringify(value) : String(value ?? '');
}

export function needsDraftRecovery(snapshot: ArticleAutosaveDraft | null, post: BlogPost) {
  if (!snapshot || snapshot.editingId !== post.id) return false;
  if (Date.parse(snapshot.updatedAt || '') <= Date.parse(post.updatedAt)) return false;
  return draftFields.some((field) => normalized(snapshot.draft[field]) !== normalized(post[field]));
}
