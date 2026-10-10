import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { AboutProfile, emptyAboutProfile } from '../../lib/about';
import { getAdminAboutProfile, updateAboutProfile } from '../../lib/aboutApi';
import { uploadHostedImage } from '../../lib/imageApi';
import { MarkdownContent } from '../MarkdownContent';

type Notify = (type: 'success' | 'error' | 'info', message: string) => void;
type FieldName = 'displayName' | 'identityTags' | 'intro' | 'githubUrl' | 'content';
type FieldErrors = Partial<Record<FieldName, string>>;

interface AboutManagerProps {
  adminPanelOpen: boolean;
  notify: Notify;
  onTogglePanel: () => void;
}

const GITHUB_ERROR = 'GitHub 链接必须是 https://github.com/{用户名}';

function formatTags(tags: string[]) {
  return tags.join(', ');
}

function parseTags(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[,，\n]/)
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isValidGithubUrl(value: string) {
  const githubUrl = value.trim();
  if (!githubUrl) return true;
  try {
    const url = new URL(githubUrl);
    const authority = githubUrl.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1];
    const pathname = url.pathname.replace(/\/+$/, '');
    const username = pathname.match(/^\/([a-z\d]+(?:-[a-z\d]+)*)$/i)?.[1];
    return url.protocol === 'https:' && url.hostname === 'github.com' && authority?.toLowerCase() === 'github.com'
      && !url.username && !url.password && Boolean(username) && username!.length <= 39;
  } catch {
    return false;
  }
}

export function AboutManager({ adminPanelOpen, notify, onTogglePanel }: AboutManagerProps) {
  const [form, setForm] = useState<AboutProfile>(() => emptyAboutProfile());
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markdownTab, setMarkdownTab] = useState<'edit' | 'preview'>('edit');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const mountedRef = useRef(true);
  const loadedGenerationRef = useRef(-1);
  const inFlightLoadRef = useRef<{ generation: number; promise: Promise<AboutProfile> } | null>(null);
  const generationRef = useRef(0);
  const asyncContextRef = useRef(adminPanelOpen);
  const loadRequestRef = useRef(0);
  const uploadRequestRef = useRef(0);
  const saveRequestRef = useRef(0);
  const openRef = useRef(adminPanelOpen);
  const focusFieldRef = useRef<FieldName | null>(null);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const identityTagsRef = useRef<HTMLTextAreaElement>(null);
  const introRef = useRef<HTMLTextAreaElement>(null);
  const githubUrlRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  if (asyncContextRef.current !== adminPanelOpen) {
    generationRef.current += 1;
    asyncContextRef.current = adminPanelOpen;
  }
  openRef.current = adminPanelOpen;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadRequestRef.current += 1;
      uploadRequestRef.current += 1;
      saveRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const field = focusFieldRef.current;
    if (!field) return;
    if (field === 'content' && markdownTab !== 'edit') {
      setMarkdownTab('edit');
      return;
    }
    const refs = { displayName: displayNameRef, identityTags: identityTagsRef, intro: introRef, githubUrl: githubUrlRef, content: contentRef };
    refs[field].current?.focus();
    focusFieldRef.current = null;
  }, [fieldErrors, markdownTab]);

  useEffect(() => {
    if (!adminPanelOpen || loadedGenerationRef.current === generationRef.current) {
      if (!adminPanelOpen) {
        loadRequestRef.current += 1;
        uploadRequestRef.current += 1;
        saveRequestRef.current += 1;
        setLoading(false);
        setUploading(false);
        setSaving(false);
      }
      return;
    }

    const requestId = ++loadRequestRef.current;
    const generation = generationRef.current;
    setLoading(true);
    const existingRequest = inFlightLoadRef.current;
    const promise = existingRequest?.generation === generation
      ? existingRequest.promise
      : getAdminAboutProfile();
    inFlightLoadRef.current = { generation, promise };
    void promise
      .then((profile) => {
        if (!mountedRef.current || !openRef.current || generation !== generationRef.current || requestId !== loadRequestRef.current) return;
        setForm(profile);
        setTagInput(formatTags(profile.identityTags));
        setFieldErrors({});
        loadedGenerationRef.current = generation;
      })
      .catch((error) => {
        if (!mountedRef.current || !openRef.current || generation !== generationRef.current || requestId !== loadRequestRef.current) return;
        notify('error', error instanceof Error ? error.message : '个人资料加载失败');
      })
      .finally(() => {
        if (inFlightLoadRef.current?.generation === generation) inFlightLoadRef.current = null;
        if (mountedRef.current && openRef.current && generation === generationRef.current && requestId === loadRequestRef.current) setLoading(false);
      });
  }, [adminPanelOpen, notify]);

  const clearFieldError = (field: FieldName) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const updateForm = (field: FieldName, patch: Partial<AboutProfile>) => {
    clearFieldError(field);
    setForm((current) => ({ ...current, ...patch }));
  };

  const focusFirstError = (errors: FieldErrors) => {
    const order: FieldName[] = ['displayName', 'identityTags', 'intro', 'githubUrl', 'content'];
    focusFieldRef.current = order.find((field) => errors[field]) ?? null;
    setFieldErrors(errors);
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('error', '请选择图片文件');
      return;
    }

    const requestId = ++uploadRequestRef.current;
    const generation = generationRef.current;
    setUploading(true);
    try {
      const image = await uploadHostedImage(file);
      if (!mountedRef.current || !openRef.current || generation !== generationRef.current || requestId !== uploadRequestRef.current) return;
      setForm((current) => ({ ...current, avatarUrl: image.path }));
      notify('success', '头像上传成功，请保存资料以正式生效');
    } catch (error) {
      if (!mountedRef.current || !openRef.current || generation !== generationRef.current || requestId !== uploadRequestRef.current) return;
      notify('error', error instanceof Error ? error.message : '头像上传失败');
    } finally {
      if (mountedRef.current && openRef.current && generation === generationRef.current && requestId === uploadRequestRef.current) setUploading(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = form.displayName.trim();
    const identityTags = parseTags(tagInput);
    const errors: FieldErrors = {};
    if (!displayName) errors.displayName = '请填写名称';
    else if (displayName.length > 80) errors.displayName = '名称不能超过 80 个字符';
    if (identityTags.length > 8) errors.identityTags = '身份标签不能超过 8 个';
    else if (identityTags.some((tag) => tag.length > 30)) errors.identityTags = '身份标签不能超过 30 个字符';
    if (form.intro.trim().length > 280) errors.intro = '简介不能超过 280 个字符';
    if (!isValidGithubUrl(form.githubUrl)) errors.githubUrl = GITHUB_ERROR;
    if (form.content.length > 100000) errors.content = '内容不能超过 100000 个字符';
    if (Object.keys(errors).length) {
      focusFirstError(errors);
      notify('error', Object.values(errors)[0]!);
      return;
    }

    const payload: AboutProfile = {
      ...form,
      displayName,
      identityTags,
      intro: form.intro.trim(),
      githubUrl: form.githubUrl.trim()
    };
    const requestId = ++saveRequestRef.current;
    const generation = generationRef.current;
    setSaving(true);
    try {
      const saved = await updateAboutProfile(payload);
      if (!mountedRef.current || !openRef.current || generation !== generationRef.current || requestId !== saveRequestRef.current) return;
      setForm(saved);
      setTagInput(formatTags(saved.identityTags));
      notify('success', '关于我资料已保存');
    } catch (error) {
      if (!mountedRef.current || !openRef.current || generation !== generationRef.current || requestId !== saveRequestRef.current) return;
      const message = error instanceof Error ? error.message : '个人资料保存失败';
      const field = message.includes('名称') ? 'displayName'
        : message.includes('身份标签') ? 'identityTags'
          : message.includes('简介') ? 'intro'
            : message.includes('GitHub') ? 'githubUrl'
              : message.includes('内容') ? 'content'
                : null;
      if (field) focusFirstError({ [field]: message });
      notify('error', message);
    } finally {
      if (mountedRef.current && openRef.current && generation === generationRef.current && requestId === saveRequestRef.current) setSaving(false);
    }
  };

  return (
    <section className={adminPanelOpen ? 'admin-group admin-about-group open' : 'admin-group admin-about-group'}>
      <div className="panel-heading">
        <div className="admin-about-heading-copy">
          <span aria-hidden="true">PROFILE / SOS</span>
          <h2>关于我</h2>
        </div>
        <button aria-controls="admin-about-panel" aria-expanded={adminPanelOpen} onClick={onTogglePanel} type="button">
          {adminPanelOpen ? '收起' : '展开'}
        </button>
      </div>
      {adminPanelOpen ? (
        <form className="admin-about-form" id="admin-about-panel" onSubmit={save}>
          {loading ? <p role="status">正在加载个人资料…</p> : null}
          <div className="admin-about-avatar-field">
            {form.avatarUrl ? <img alt="头像预览" className="admin-about-avatar-preview" src={form.avatarUrl} /> : null}
            <label>
              上传头像
              <input accept="image/*" aria-label="上传头像" disabled={loading || uploading || saving} onChange={uploadAvatar} type="file" />
            </label>
            {uploading ? <span role="status">正在上传头像…</span> : null}
          </div>
          <label>名称<input aria-describedby={fieldErrors.displayName ? 'admin-about-display-name-error' : undefined} aria-invalid={Boolean(fieldErrors.displayName)} aria-label="名称" disabled={loading} onChange={(event) => updateForm('displayName', { displayName: event.target.value })} ref={displayNameRef} value={form.displayName} />{fieldErrors.displayName ? <span id="admin-about-display-name-error" role="alert">{fieldErrors.displayName}</span> : null}</label>
          <label>身份标签<textarea aria-describedby={fieldErrors.identityTags ? 'admin-about-identity-tags-error' : undefined} aria-invalid={Boolean(fieldErrors.identityTags)} aria-label="身份标签" disabled={loading} onChange={(event) => { clearFieldError('identityTags'); setTagInput(event.target.value); }} placeholder="用逗号或换行分隔" ref={identityTagsRef} rows={2} value={tagInput} />{fieldErrors.identityTags ? <span id="admin-about-identity-tags-error" role="alert">{fieldErrors.identityTags}</span> : null}</label>
          <label>简短介绍<textarea aria-describedby={fieldErrors.intro ? 'admin-about-intro-error' : undefined} aria-invalid={Boolean(fieldErrors.intro)} aria-label="简短介绍" disabled={loading} onChange={(event) => updateForm('intro', { intro: event.target.value })} ref={introRef} value={form.intro} />{fieldErrors.intro ? <span id="admin-about-intro-error" role="alert">{fieldErrors.intro}</span> : null}</label>
          <label>GitHub 个人链接<input aria-describedby={fieldErrors.githubUrl ? 'admin-about-github-url-error' : undefined} aria-invalid={Boolean(fieldErrors.githubUrl)} aria-label="GitHub 个人链接" disabled={loading} onChange={(event) => updateForm('githubUrl', { githubUrl: event.target.value })} placeholder="https://github.com/username" ref={githubUrlRef} value={form.githubUrl} />{fieldErrors.githubUrl ? <span id="admin-about-github-url-error" role="alert">{fieldErrors.githubUrl}</span> : null}</label>
          <div aria-label="Markdown 详细介绍模式" className="segmented-control admin-about-markdown-tabs" role="tablist">
            <button
              aria-controls="admin-about-markdown-edit-panel"
              aria-selected={markdownTab === 'edit'}
              className={markdownTab === 'edit' ? 'active' : ''}
              disabled={loading}
              id="admin-about-markdown-edit-tab"
              onClick={() => setMarkdownTab('edit')}
              role="tab"
              type="button"
            >编辑</button>
            <button
              aria-controls="admin-about-markdown-preview-panel"
              aria-selected={markdownTab === 'preview'}
              className={markdownTab === 'preview' ? 'active' : ''}
              disabled={loading}
              id="admin-about-markdown-preview-tab"
              onClick={() => setMarkdownTab('preview')}
              role="tab"
              type="button"
            >预览</button>
          </div>
          {markdownTab === 'edit' ? (
            <div aria-labelledby="admin-about-markdown-edit-tab" id="admin-about-markdown-edit-panel" role="tabpanel">
              <label>Markdown 详细介绍<textarea aria-describedby={fieldErrors.content ? 'admin-about-content-error' : undefined} aria-invalid={Boolean(fieldErrors.content)} aria-label="Markdown 详细介绍" disabled={loading} onChange={(event) => updateForm('content', { content: event.target.value })} ref={contentRef} value={form.content} />{fieldErrors.content ? <span id="admin-about-content-error" role="alert">{fieldErrors.content}</span> : null}</label>
            </div>
          ) : (
            <div
              aria-labelledby="admin-about-markdown-preview-tab"
              className="admin-about-markdown-preview"
              id="admin-about-markdown-preview-panel"
              role="tabpanel"
            ><MarkdownContent content={form.content} /></div>
          )}
          <button className="admin-about-save" disabled={saving || uploading || loading} type="submit">{saving ? '保存中…' : '保存资料'}</button>
        </form>
      ) : null}
    </section>
  );
}
