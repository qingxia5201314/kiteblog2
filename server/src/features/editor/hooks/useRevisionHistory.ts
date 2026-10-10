import { useCallback, useEffect, useState } from 'react';
import { PostRevision, PostRevisionComparison } from '../../../lib/blog';
import { compareRevision, deleteRevision, listRevisions, restoreRevision } from '../api/editorWorkflowApi';

export function useRevisionHistory(postId: string | null) {
  const [revisions, setRevisions] = useState<PostRevision[]>([]);
  const [comparison, setComparison] = useState<PostRevisionComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingRevisionId, setDeletingRevisionId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!postId) return setRevisions([]);
    setLoading(true); setError('');
    try { setRevisions(await listRevisions(postId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '版本加载失败'); }
    finally { setLoading(false); }
  }, [postId]);

  useEffect(() => { void reload(); }, [reload]);

  return {
    revisions, comparison, loading, error, deletingRevisionId, reload,
    compare: async (revisionId: string) => setComparison(await compareRevision(postId!, revisionId)),
    restore: (revisionId: string) => restoreRevision(postId!, revisionId),
    remove: async (revisionId: string) => {
      setDeletingRevisionId(revisionId);
      setError('');
      try {
        await deleteRevision(postId!, revisionId);
        await reload();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '版本删除失败');
        throw reason;
      } finally {
        setDeletingRevisionId(null);
      }
    },
    closeComparison: () => setComparison(null)
  };
}
