import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMarkdownEditor } from './useMarkdownEditor';

function Harness() {
  const [content, setContent] = useState('- one\n- two');
  const editor = useMarkdownEditor({
    content,
    updateForm: (patch) => {
      if (patch.content !== undefined) setContent(patch.content);
    },
    notify: vi.fn()
  });
  return <>
    <textarea onChange={(event) => setContent(event.target.value)} onKeyDown={editor.handleEditorKeyDown} ref={editor.contentEditorRef} value={content} />
    <button onClick={() => void editor.insertImageFile(new File(['png'], 'inline.png', { type: 'image/png' }))} type="button">upload</button>
  </>;
}

describe('useMarkdownEditor', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('handles Tab inside the textarea instead of moving browser focus', async () => {
    await act(async () => root.render(<Harness />));
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(textarea.value).toBe('  - one\n  - two');
    expect(document.activeElement).toBe(textarea);
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([2, 15]);
  });

  it('uploads an editor image through cookie auth without a token option', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ image: {
      id: 'image-1', originalName: 'inline.png', contentType: 'image/png', sizeBytes: 3,
      uploadedAt: '2026-07-15T00:00:00.000Z', path: '/api/images/raw/image-1'
    } }));
    await act(async () => root.render(<Harness />));

    await act(async () => host.querySelector('button')?.click());

    expect(fetchMock).toHaveBeenCalledWith('/api/images', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin'
    }));
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toContain('/api/images/raw/image-1');
  });
});
