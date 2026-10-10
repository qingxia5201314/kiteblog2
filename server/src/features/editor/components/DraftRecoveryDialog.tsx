import { useEffect, useRef, useState } from 'react';
import { ArticleAutosaveDraft } from '../../../lib/blog';

interface DraftRecoveryDialogProps {
  snapshot: ArticleAutosaveDraft;
  onRestore: () => void;
  onDiscard: () => void;
}

export function DraftRecoveryDialog({ snapshot, onRestore, onDiscard }: DraftRecoveryDialogProps) {
  const [inspecting, setInspecting] = useState(false);
  const restoreRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    restoreRef.current?.focus();
  }, []);

  return (
    <div aria-labelledby="draft-recovery-title" aria-modal="true" className="draft-recovery-backdrop" role="dialog">
      <section className="draft-recovery-dialog">
        <p className="eyebrow">Draft recovery</p>
        <h2 id="draft-recovery-title">发现更新的自动草稿</h2>
        <p>
          《{snapshot.draft.title || '未命名草稿'}》保存于{' '}
          {new Date(snapshot.updatedAt || Date.now()).toLocaleString('zh-CN')}
        </p>
        {inspecting ? (
          <div className="draft-recovery-preview">
            <strong>{snapshot.draft.summary || '暂无摘要'}</strong>
            <pre>{snapshot.draft.content || '暂无正文'}</pre>
          </div>
        ) : null}
        <div className="draft-recovery-actions">
          <button onClick={() => setInspecting((current) => !current)} type="button">
            {inspecting ? '收起草稿' : '查看草稿'}
          </button>
          <button className="secondary" onClick={onDiscard} type="button">放弃草稿</button>
          <button onClick={onRestore} ref={restoreRef} type="button">恢复草稿</button>
        </div>
      </section>
    </div>
  );
}
