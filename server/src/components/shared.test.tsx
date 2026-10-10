import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageWithFallback, permissionLabel } from './shared';
import { renderMarkdown } from './MarkdownContent';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Panel } from './ui/Panel';
import { SectionHeader } from './ui/SectionHeader';

describe('ImageWithFallback', () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  async function waitFor(check: () => Element | null) {
    for (let index = 0; index < 80; index += 1) {
      const result = check();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return null;
  }

  afterEach(() => {
    roots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
  });

  it('renders fallback content after the image load fails', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(
        <ImageWithFallback
          alt="broken cover"
          className="cover-thumb"
          src="/api/images/raw/missing"
          fallback={<span className="cover-dot">fallback</span>}
        />
      );
    });

    const image = await waitFor(() => host.querySelector('img.cover-thumb'));
    expect(image).toBeTruthy();

    await act(async () => {
      image?.dispatchEvent(new Event('error'));
    });

    expect(await waitFor(() => host.querySelector('.cover-dot'))).toBeTruthy();
    expect(host.querySelector('img.cover-thumb')).toBeFalsy();
  });

  it('renders inline formulas without parsing escaped dollars or inline code', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(
        <div>{renderMarkdown('公式 $E = mc^2$，价格 \\$100，代码 `$notMath$`。')}</div>
      );
    });

    expect(host.querySelector('.katex')).toBeTruthy();
    expect(host.querySelector('code')?.textContent).toBe('$notMath$');
    expect(host.textContent).toContain('价格 $100');
    expect(host.querySelectorAll('.katex')).toHaveLength(1);
  });

  it('renders parenthesized LaTeX inline formulas', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<div>{renderMarkdown('如果整数 \\(a\\) 可以写成，所以 \\(3\\mid12\\)。')}</div>);
    });

    expect(host.querySelectorAll('.katex')).toHaveLength(2);
    expect(host.textContent).not.toContain('\\(a\\)');
    expect(host.textContent).not.toContain('\\(3\\mid12\\)');
  });

  it('returns readable Chinese permission labels', () => {
    expect(permissionLabel('admin')).toBe('管理员');
    expect(permissionLabel('reader')).toBe('读者用户');
  });

  it('renders display formulas through the shared markdown renderer', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<div>{renderMarkdown('$$\n\\frac{a}{b}\n$$')}</div>);
    });

    expect(host.querySelector('.katex-display')).toBeTruthy();
  });

  it('renders standard markdown tables', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(
        <div>
          {renderMarkdown('| 项目 | RIP | OSPF |\n| --- | --- | --- |\n| 分类 | 距离向量 | 链路状态 |')}
        </div>
      );
    });

    expect(host.querySelector('table')).toBeTruthy();
    expect(host.querySelectorAll('th')).toHaveLength(3);
    expect(host.querySelectorAll('td')).toHaveLength(3);
    expect(host.textContent).toContain('链路状态');
  });

  it('wraps standard markdown images in the article image frame', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<div>{renderMarkdown('![cover](/api/images/raw/img-1)')}</div>);
    });

    expect(host.querySelector('figure.article-image img')).toBeTruthy();
    expect(host.querySelector('.article-image figcaption')?.textContent).toBe('cover');
  });
});

describe('shared UI presentation components', () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
  });

  it('renders the shared panel wrapper with custom classes', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<Panel className="article-panel">内容面板</Panel>);
    });

    expect(host.querySelector('section.ui-panel.article-panel')?.textContent).toBe('内容面板');
  });

  it('renders button, badge, empty state, and section header primitives', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(
        <div>
          <Button className="save-button">保存</Button>
          <Badge className="tag-badge">标签</Badge>
          <EmptyState title="暂无内容" description="稍后再来" />
          <SectionHeader eyebrow="Kitepop" title="文章列表" description="最近更新" />
        </div>
      );
    });

    expect(host.querySelector('button.ui-button.save-button')?.textContent).toBe('保存');
    expect(host.querySelector('span.ui-badge.tag-badge')?.textContent).toBe('标签');
    expect(host.querySelector('.ui-empty-state h3')?.textContent).toBe('暂无内容');
    expect(host.querySelector('.ui-empty-state p')?.textContent).toBe('稍后再来');
    expect(host.querySelector('.ui-section-header .eyebrow')?.textContent).toBe('Kitepop');
    expect(host.querySelector('.ui-section-header h2')?.textContent).toBe('文章列表');
    expect(host.querySelectorAll('.ui-section-header p')[1]?.textContent).toBe('最近更新');
  });
});
