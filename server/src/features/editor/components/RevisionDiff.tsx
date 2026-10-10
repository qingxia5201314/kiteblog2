import { PostRevisionComparison } from '../../../lib/blog';

const labels: Record<string, string> = {
  title: '标题', summary: '摘要', content: '正文', category: '分类', tags: '标签', cover: '封面类型', coverImage: '封面图', status: '状态'
};

function display(value: unknown) {
  return Array.isArray(value) ? value.join(', ') : String(value ?? '');
}

export function RevisionDiff({ comparison, onClose }: { comparison: PostRevisionComparison; onClose: () => void }) {
  return (
    <div className="revision-diff">
      <div className="panel-heading"><h4>与当前版本对比</h4><button onClick={onClose} type="button">关闭</button></div>
      {comparison.changes.length ? comparison.changes.map((change) => (
        <div className="revision-diff-row" key={change.field}>
          <strong>{labels[change.field] || change.field}</strong>
          <div><span>历史版本</span><pre>{display(change.revision)}</pre></div>
          <div><span>当前版本</span><pre>{display(change.current)}</pre></div>
        </div>
      )) : <p>该版本与当前内容一致。</p>}
    </div>
  );
}
