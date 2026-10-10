import { PostRevision, PostRevisionComparison } from '../../../lib/blog';
import { RevisionDiff } from './RevisionDiff';

interface RevisionPanelProps {
  revisions: PostRevision[];
  comparison: PostRevisionComparison | null;
  loading: boolean;
  error: string;
  deletingRevisionId: string | null;
  onCompare: (revisionId: string) => void;
  onRestore: (revisionId: string) => void;
  onRemove: (revision: PostRevision) => void;
  onCloseComparison: () => void;
}

const sourceLabel: Record<string, string> = {
  create: '创建', 'manual-save': '手动保存', publish: '发布', withdraw: '撤回', schedule: '设置定时',
  'schedule-cancel': '取消定时', 'scheduled-publish': '定时发布前', 'restore-backup': '恢复前备份', restore: '历史恢复'
};

export function RevisionPanel(props: RevisionPanelProps) {
  return (
    <section className="editor-workflow-panel revision-panel">
      <div className="workflow-title"><div><p className="eyebrow">History</p><h3>版本历史</h3></div><span>{props.revisions.length} 个版本</span></div>
      {props.loading ? <p role="status">正在加载版本...</p> : null}
      {props.error ? <p className="workflow-error">{props.error}</p> : null}
      <div className="revision-list">
        {props.revisions.map((revision) => (
          <article key={revision.id}>
            <div><strong>{sourceLabel[revision.source] || revision.source}</strong><time>{new Date(revision.createdAt).toLocaleString('zh-CN')}</time></div>
            <p>{revision.title || '未命名文章'} · {revision.status}</p>
            <div className="workflow-actions">
              <button onClick={() => props.onCompare(revision.id)} type="button">查看与对比</button>
              <button onClick={() => props.onRestore(revision.id)} type="button">恢复</button>
              <button
                aria-label={revision.isProtected ? '该版本受保护' : `删除版本 ${revision.title}`}
                className={revision.isProtected ? 'protected-revision-action' : 'danger'}
                onClick={() => props.onRemove(revision)}
                title={revision.isProtected ? '发布、恢复备份等关键版本不可删除' : '删除此历史版本'}
                type="button"
              >
                {revision.isProtected ? '受保护' : props.deletingRevisionId === revision.id ? '删除中...' : '删除'}
              </button>
            </div>
          </article>
        ))}
        {!props.loading && !props.revisions.length ? <p>手动保存或发布后会在这里生成版本。</p> : null}
      </div>
      {props.comparison ? <RevisionDiff comparison={props.comparison} onClose={props.onCloseComparison} /> : null}
    </section>
  );
}
