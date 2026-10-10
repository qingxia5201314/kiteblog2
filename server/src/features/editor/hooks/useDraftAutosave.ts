import { useCallback, useEffect, useRef, useState } from 'react';
import { ArticleAutosaveDraft, BlogPostDraft } from '../../../lib/blog';
import { saveArticleAutosaveDraft } from '../../../lib/blogApi';
import { createDraftAutosaveRepository } from '../../../lib/draftAutosave';

const repository = createDraftAutosaveRepository();

function hasDraftContent(draft: BlogPostDraft) {
  return Boolean(
    draft.title.trim() || draft.summary.trim() || draft.content.trim() || draft.tags.length > 0 || draft.coverImage?.trim()
  );
}

interface UseDraftAutosaveOptions {
  enabled: boolean;
  editingId: string | null;
  draft: BlogPostDraft;
  changeVersion: number;
  onBoundEditingId?: (editingId: string) => void;
  onSaved?: (snapshot: ArticleAutosaveDraft) => void;
}

export function useDraftAutosave({
  enabled,
  editingId,
  draft,
  changeVersion,
  onBoundEditingId,
  onSaved
}: UseDraftAutosaveOptions) {
  const [note, setNote] = useState('');
  const latestRef = useRef({ editingId, draft });
  const callbacksRef = useRef({ onBoundEditingId, onSaved });
  const generationRef = useRef(0);
  const observedVersionRef = useRef(0);
  const dirtyRef = useRef(false);
  const queuedRef = useRef(false);
  const inFlightRef = useRef<Promise<ArticleAutosaveDraft | null> | null>(null);
  const saveNowRef = useRef<() => Promise<ArticleAutosaveDraft | null>>(async () => null);

  useEffect(() => {
    callbacksRef.current = { onBoundEditingId, onSaved };
  }, [onBoundEditingId, onSaved]);

  useEffect(() => {
    latestRef.current = { editingId, draft };
    if (changeVersion === 0) {
      observedVersionRef.current = 0;
      generationRef.current = 0;
      dirtyRef.current = false;
      queuedRef.current = false;
      setNote(enabled ? '当前内容未修改' : '');
      return;
    }
    if (!enabled || !hasDraftContent(draft) || changeVersion <= observedVersionRef.current) return;
    observedVersionRef.current = changeVersion;
    generationRef.current = changeVersion;
    dirtyRef.current = true;
    setNote('10s后自动保存文章');
    repository.save(draft, { editingId });
  }, [changeVersion, draft, editingId, enabled]);

  const saveNow = useCallback(async () => {
    const latest = latestRef.current;
    if (!enabled || !dirtyRef.current || !hasDraftContent(latest.draft)) return null;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return inFlightRef.current;
    }

    const savedGeneration = generationRef.current;
    setNote('正在自动保存...');
    const request = saveArticleAutosaveDraft({ editingId: latest.editingId, draft: latest.draft })
      .then((snapshot) => {
        if (latestRef.current.editingId !== latest.editingId) return snapshot;
        if (snapshot.editingId && snapshot.editingId !== latest.editingId) {
          callbacksRef.current.onBoundEditingId?.(snapshot.editingId);
        }
        repository.save(snapshot.draft, {
          editingId: snapshot.editingId,
          updatedAt: snapshot.updatedAt
        });
        callbacksRef.current.onSaved?.(snapshot);
        if (generationRef.current === savedGeneration) {
          dirtyRef.current = false;
        } else {
          queuedRef.current = true;
        }
        setNote(`已自动保存 ${new Date(snapshot.updatedAt || Date.now()).toLocaleTimeString('zh-CN', {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        })}`);
        return snapshot;
      })
      .catch(() => {
        repository.save(latestRef.current.draft, { editingId: latestRef.current.editingId });
        setNote('网络不可用，草稿已保存在本机');
        return null;
      })
      .finally(() => {
        inFlightRef.current = null;
        if (queuedRef.current && dirtyRef.current) {
          queuedRef.current = false;
          queueMicrotask(() => void saveNowRef.current());
        }
      });
    inFlightRef.current = request;
    return request;
  }, [enabled]);

  saveNowRef.current = saveNow;

  useEffect(() => {
    if (!enabled) {
      setNote('');
      return;
    }
    let remaining = 10;
    setNote(dirtyRef.current ? `${remaining}s后自动保存文章` : '当前内容未修改');
    const timer = window.setInterval(() => {
      if (!dirtyRef.current) {
        remaining = 10;
        if (!inFlightRef.current) setNote('当前内容未修改');
        return;
      }
      remaining -= 1;
      if (remaining <= 0) {
        void saveNowRef.current();
        remaining = 10;
      } else if (!inFlightRef.current) {
        setNote(`${remaining}s后自动保存文章`);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const handleOnline = () => void saveNowRef.current();
    const handlePageHide = () => {
      const latest = latestRef.current;
      if (!dirtyRef.current || !hasDraftContent(latest.draft)) return;
      void fetch('/api/admin/article-draft', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ editingId: latest.editingId, draft: latest.draft }),
        credentials: 'same-origin',
        keepalive: true
      });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [enabled]);

  return { note, saveNow };
}
