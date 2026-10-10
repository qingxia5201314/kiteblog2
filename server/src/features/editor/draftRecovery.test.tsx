import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlogPostDraft } from '../../lib/blog';
import { useDraftAutosave } from './hooks/useDraftAutosave';
import { DraftRecoveryDialog } from './components/DraftRecoveryDialog';
import { needsDraftRecovery } from './draftRecovery';

const emptyDraft: BlogPostDraft = {
  title: '', summary: '', category: 'life', tags: [], content: '', status: 'draft', cover: 'life', coverImage: ''
};

function Harness({ onBound, initialDraft = emptyDraft }: { onBound: (id: string) => void; initialDraft?: BlogPostDraft }) {
  const [draft, setDraft] = useState(initialDraft);
  const [changeVersion, setChangeVersion] = useState(0);
  const autosave = useDraftAutosave({
    enabled: true,
    editingId: null,
    draft,
    changeVersion,
    onBoundEditingId: onBound
  });
  return (
    <div>
      <button onClick={() => {
        setDraft((current) => ({ ...current, title: `${current.title}自动保存标题` }));
        setChangeVersion((current) => current + 1);
      }}>write</button>
      <span data-note>{autosave.note}</span>
    </div>
  );
}

function SwitchingHarness({ onBound }: { onBound: (id: string) => void }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [changeVersion, setChangeVersion] = useState(0);
  useDraftAutosave({ enabled: true, editingId, draft, changeVersion, onBoundEditingId: onBound });
  return <div>
    <button onClick={() => { setDraft({ ...emptyDraft, title: '新草稿' }); setChangeVersion(1); }}>write</button>
    <button onClick={() => { setEditingId('post-b'); setDraft({ ...emptyDraft, title: '文章 B' }); setChangeVersion(0); }}>switch</button>
  </div>;
}

describe('draft autosave hook', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('silently saves after ten seconds and binds a server-created draft post', async () => {
    const onBound = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        draft: { editingId: 'draft-post-1', draft: { ...emptyDraft, title: '自动保存标题' }, updatedAt: '2026-07-12T00:00:00.000Z' }
      })
    );
    await act(async () => root.render(<Harness onBound={onBound} />));
    await act(async () => container.querySelector('button')?.click());

    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/article-draft');
    expect(onBound).toHaveBeenCalledWith('draft-post-1');
    expect(container.querySelector('[data-note]')?.textContent).toContain('已自动保存');
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Authorization');
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Bearer');
  });

  it('keeps pagehide autosave cookie-authenticated without a bearer header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ draft: null }));
    await act(async () => root.render(<Harness onBound={vi.fn()} />));
    await act(async () => container.querySelector('button')?.click());

    await act(async () => window.dispatchEvent(new Event('pagehide')));

    const [, init] = fetchMock.mock.calls[0];
    expect(init).toMatchObject({ method: 'PUT', keepalive: true, credentials: 'same-origin' });
    expect(JSON.stringify(init?.headers)).not.toContain('Authorization');
    expect(JSON.stringify(init?.headers)).not.toContain('Bearer');
  });

  it('does not autosave content that was only loaded into the editor', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ draft: null }));
    await act(async () => root.render(
      <Harness initialDraft={{ ...emptyDraft, title: '仅打开，未修改' }} onBound={vi.fn()} />
    ));

    await act(async () => vi.advanceTimersByTimeAsync(20_000));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps at most one request in flight and flushes the newer generation afterward', async () => {
    const resolvers: Array<(response: Response) => void> = [];
    let concurrent = 0;
    let maxConcurrent = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      return new Promise<Response>((resolve) => {
        resolvers.push((response) => {
          concurrent -= 1;
          resolve(response);
        });
      });
    });
    await act(async () => root.render(<Harness onBound={vi.fn()} />));
    await act(async () => container.querySelector('button')?.click());
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    await act(async () => container.querySelector('button')?.click());
    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(maxConcurrent).toBe(1);
    expect(resolvers).toHaveLength(1);

    await act(async () => resolvers[0](Response.json({ draft: { editingId: 'post-1', draft: emptyDraft, updatedAt: new Date().toISOString() } })));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(resolvers).toHaveLength(2);
  });

  it('ignores an old autosave response after the editor switches to another article', async () => {
    let resolveRequest!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    const onBound = vi.fn();
    await act(async () => root.render(<SwitchingHarness onBound={onBound} />));
    const [write, switchArticle] = Array.from(container.querySelectorAll('button'));
    await act(async () => write.click());
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    await act(async () => switchArticle.click());

    await act(async () => resolveRequest(Response.json({
      draft: { editingId: 'old-auto-draft', draft: { ...emptyDraft, title: '新草稿' }, updatedAt: '2026-07-12T00:00:00.000Z' }
    })));

    expect(onBound).not.toHaveBeenCalled();
  });
});

describe('draft recovery dialog', () => {
  it('lets the editor inspect, restore, or discard a newer snapshot', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onRestore = vi.fn();
    const onDiscard = vi.fn();
    await act(async () => root.render(
      <DraftRecoveryDialog
        onDiscard={onDiscard}
        onRestore={onRestore}
        snapshot={{ editingId: 'post-1', updatedAt: '2026-07-12T00:00:00.000Z', draft: { ...emptyDraft, title: '恢复标题', content: '恢复正文' } }}
      />
    ));

    await act(async () => (Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '查看草稿') as HTMLButtonElement).click());
    expect(host.textContent).toContain('恢复正文');
    await act(async () => (Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '恢复草稿') as HTMLButtonElement).click());
    await act(async () => (Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '放弃草稿') as HTMLButtonElement).click());
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    host.remove();
  });
});

describe('draft recovery decision', () => {
  const post = {
    id: 'post-1', slug: 'post-1', title: '文章', summary: '摘要', category: 'life' as const,
    tags: ['tag'], content: '正文', status: 'published' as const, cover: 'life' as const,
    coverImage: '', createdAt: '2026-07-11T00:00:00.000Z', updatedAt: '2026-07-11T01:00:00.000Z'
  };

  it('does not offer recovery for a newer but identical autosave snapshot', () => {
    expect(needsDraftRecovery({
      editingId: post.id,
      updatedAt: '2026-07-11T01:00:00.001Z',
      draft: { title: post.title, summary: post.summary, category: post.category, tags: post.tags, content: post.content, status: post.status, cover: post.cover, coverImage: '' }
    }, post)).toBe(false);
  });

  it('offers recovery when the newer snapshot contains actual edits', () => {
    expect(needsDraftRecovery({
      editingId: post.id,
      updatedAt: '2026-07-11T01:00:00.001Z',
      draft: { title: '修改后的文章', summary: post.summary, category: post.category, tags: post.tags, content: post.content, status: post.status, cover: post.cover, coverImage: '' }
    }, post)).toBe(true);
  });
});
