import { useState } from 'react';
import { BlogPost } from '../../../lib/blog';

interface PublishScheduleControlProps {
  post: BlogPost | null;
  onSchedule: (scheduledAt: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onRetry: () => Promise<void>;
}

export function PublishScheduleControl({ post, onSchedule, onCancel, onRetry }: PublishScheduleControlProps) {
  const [scheduledAt, setScheduledAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!post) return null;

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await operation(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '定时发布操作失败'); }
    finally { setBusy(false); }
  };

  return (
    <section className="editor-workflow-panel schedule-panel">
      <div className="workflow-title"><div><p className="eyebrow">Schedule</p><h3>定时发布</h3></div><span>{post.status === 'scheduled' ? '已计划' : '未计划'}</span></div>
      {post.scheduledAt ? <p>计划时间：{new Date(post.scheduledAt).toLocaleString('zh-CN')}</p> : null}
      {post.scheduleError ? <p className="workflow-error">发布失败：{post.scheduleError}</p> : null}
      <div className="schedule-controls">
        <label>发布时间<input min={new Date().toISOString().slice(0, 16)} onChange={(event) => setScheduledAt(event.target.value)} type="datetime-local" value={scheduledAt} /></label>
        <button disabled={busy || !scheduledAt} onClick={() => void run(() => onSchedule(new Date(scheduledAt).toISOString()))} type="button">设置定时</button>
        {post.status === 'scheduled' ? <button disabled={busy} onClick={() => void run(onCancel)} type="button">取消定时</button> : null}
        {post.scheduleError ? <button disabled={busy} onClick={() => void run(onRetry)} type="button">立即重试</button> : null}
      </div>
      {error ? <p className="workflow-error">{error}</p> : null}
    </section>
  );
}
