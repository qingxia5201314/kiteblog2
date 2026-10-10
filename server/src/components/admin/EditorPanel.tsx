import { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode, RefObject } from 'react';
import { BLOG_CATEGORIES, BlogCategoryId, PostStatus } from '../../lib/blog';
import { normalizeImageUrl } from '../../lib/imageUrl';
import { safeImageAttributes } from '../shared';
import { renderMarkdown } from '../MarkdownContent';

interface EditorForm {
  title: string;
  summary: string;
  category: BlogCategoryId;
  tags: string[];
  content: string;
  status: PostStatus;
  cover: BlogCategoryId;
  coverImage: string;
}

interface EditorPanelProps {
  editingId: string | null;
  form: EditorForm;
  tagInput: string;
  editorTab: 'edit' | 'preview';
  autosaveNote: string;
  uploadingImage: boolean;
  contentEditorRef: RefObject<HTMLTextAreaElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  coverImageInputRef: RefObject<HTMLInputElement | null>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateForm: (patch: Partial<EditorForm>) => void;
  onUpdateTagInput: (value: string) => void;
  onSetEditorTab: (tab: 'edit' | 'preview') => void;
  onUploadCoverImage: (file?: File) => void;
  onInsertImage: (file?: File) => void;
  onInsertSnippet: (before: string, after?: string, placeholder?: string) => void;
  onPasteImage: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onEditorKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  previewAction?: ReactNode;
  workflowContent?: ReactNode;
}

export function EditorPanel({
  editingId,
  form,
  tagInput,
  editorTab,
  autosaveNote,
  uploadingImage,
  contentEditorRef,
  imageInputRef,
  coverImageInputRef,
  onSubmit,
  onUpdateForm,
  onUpdateTagInput,
  onSetEditorTab,
  onUploadCoverImage,
  onInsertImage,
  onInsertSnippet,
  onPasteImage,
  onEditorKeyDown,
  previewAction,
  workflowContent
}: EditorPanelProps) {
  const formCoverImage = form.coverImage ? normalizeImageUrl(form.coverImage) : undefined;

  return (
    <form className="editor-panel" onSubmit={onSubmit}>
      <div className="panel-heading">
        <h2>{editingId ? '编辑文章' : '新建文章'}</h2>
        <div className="editor-heading-actions">
          {previewAction}
          <button type="submit">{editingId ? '保存更新' : '保存文章'}</button>
        </div>
      </div>
      {autosaveNote ? <p className="autosave-note">{autosaveNote}</p> : null}

      <label>
        标题
        <input
          aria-label="文章标题"
          onChange={(event) => onUpdateForm({ title: event.target.value })}
          placeholder="例如：一次越权风险复盘"
          value={form.title}
        />
      </label>
      <label>
        摘要
        <textarea
          onChange={(event) => onUpdateForm({ summary: event.target.value })}
          placeholder="用一两句话说明这篇文章的核心内容"
          rows={3}
          value={form.summary}
        />
      </label>
      <div className="form-grid">
        <label>
          分类
          <select
            onChange={(event) =>
              onUpdateForm({
                category: event.target.value as BlogCategoryId,
                cover: event.target.value as BlogCategoryId
              })
            }
            value={form.category}
          >
            {BLOG_CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          状态
          <select onChange={(event) => onUpdateForm({ status: event.target.value as PostStatus })} value={form.status}>
            <option value="draft">草稿</option>
            <option value="published">发布</option>
          </select>
        </label>
      </div>
      <label>
        封面图 URL
        <div className="cover-input-row">
          <input
            onChange={(event) => onUpdateForm({ coverImage: event.target.value })}
            placeholder="请输入 HTTPS 图片 URL，或本站图床链接"
            value={form.coverImage ?? ''}
          />
          <input
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden-input"
            onChange={(event) => onUploadCoverImage(event.target.files?.[0])}
            ref={coverImageInputRef}
            type="file"
          />
          <button disabled={uploadingImage} onClick={() => coverImageInputRef.current?.click()} type="button">
            {uploadingImage ? '上传中...' : '上传封面'}
          </button>
        </div>
      </label>
      <label>
        标签
        <input onChange={(event) => onUpdateTagInput(event.target.value)} placeholder="用逗号分隔标签" value={tagInput} />
      </label>
      <div className="segmented-control editor-tabs">
        <button className={editorTab === 'edit' ? 'active' : ''} onClick={() => onSetEditorTab('edit')} type="button">
          编辑
        </button>
        <button className={editorTab === 'preview' ? 'active' : ''} onClick={() => onSetEditorTab('preview')} type="button">
          预览
        </button>
      </div>

      {editorTab === 'edit' ? (
        <section className="markdown-editor">
          <div className="markdown-toolbar" aria-label="Markdown 工具栏">
            <input
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden-input"
              onChange={(event) => onInsertImage(event.target.files?.[0])}
              ref={imageInputRef}
              type="file"
            />
            <button aria-label="一级标题" onClick={() => onInsertSnippet('# ')} title="一级标题" type="button">
              H1
            </button>
            <button aria-label="二级标题" onClick={() => onInsertSnippet('## ')} title="二级标题" type="button">
              H2
            </button>
            <button aria-label="粗体" onClick={() => onInsertSnippet('**', '**')} title="粗体" type="button">
              B
            </button>
            <button aria-label="行内代码" onClick={() => onInsertSnippet('`', '`', 'code')} title="行内代码" type="button">
              &lt;/&gt;
            </button>
            <button aria-label="引用" onClick={() => onInsertSnippet('> ')} title="引用" type="button">
              "
            </button>
            <button aria-label="列表" onClick={() => onInsertSnippet('- ')} title="列表" type="button">
              -
            </button>
            <button
              aria-label="链接"
              onClick={() => onInsertSnippet('[', '](https://example.com)', '链接文字')}
              title="链接"
              type="button"
            >
              -&gt;
            </button>
            <button
              aria-label="代码块"
              onClick={() => onInsertSnippet('```bash\n', '\n```', 'npm run build')}
              title="代码块"
              type="button"
            >
              []
            </button>
            <button aria-label="行内公式" onClick={() => onInsertSnippet('$', '$', 'E = mc^2')} title="行内公式" type="button">
              f(x)
            </button>
            <button
              aria-label="块级公式"
              onClick={() => onInsertSnippet('$$\n', '\n$$', '\\frac{a}{b}')}
              title="块级公式"
              type="button"
            >
              Σ
            </button>
            <button aria-label="上传图片" disabled={uploadingImage} onClick={() => imageInputRef.current?.click()} title="上传图片" type="button">
              {uploadingImage ? '...' : 'IMG'}
            </button>
          </div>
          <label>
            正文
            <textarea
              className="content-editor"
              onChange={(event) => onUpdateForm({ content: event.target.value })}
              onKeyDown={onEditorKeyDown}
              onPaste={onPasteImage}
              placeholder="支持 Markdown：标题、粗体、代码、链接、引用、列表、代码块、图片、行内公式和块级公式。"
              ref={contentEditorRef}
              rows={16}
              value={form.content}
            />
          </label>
        </section>
      ) : (
        <div className="editor-preview">
          {formCoverImage ? (
            <img alt={form.title || '封面图'} className="article-cover-image" src={formCoverImage} {...safeImageAttributes} />
          ) : null}
          <h2>{form.title || '未命名文章'}</h2>
          <p className="summary">{form.summary || '这里会显示文章摘要。'}</p>
          <div className="article-body">{renderMarkdown(form.content || '正文预览会显示在这里。')}</div>
        </div>
      )}
      {workflowContent ? <div className="editor-workflows">{workflowContent}</div> : null}
    </form>
  );
}
