import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArticleManager } from '../components/admin/ArticleManager';
import { AboutManager } from '../components/admin/AboutManager';
import { EditorPanel } from '../components/admin/EditorPanel';
import { UserManager } from '../components/admin/UserManager';
import { DraftRecoveryDialog } from '../features/editor/components/DraftRecoveryDialog';
import { ArticlePreviewAction } from '../features/editor/components/ArticlePreviewAction';
import { RevisionPanel } from '../features/editor/components/RevisionPanel';
import { PublishScheduleControl } from '../features/editor/components/PublishScheduleControl';
import { useRevisionHistory } from '../features/editor/hooks/useRevisionHistory';
import { cancelSchedule, retrySchedule, schedulePost } from '../features/editor/api/editorWorkflowApi';
import { needsDraftRecovery } from '../features/editor/draftRecovery';
import { useDraftAutosave } from '../features/editor/hooks/useDraftAutosave';
import { useMarkdownEditor } from '../features/editor/hooks/useMarkdownEditor';
import { useApp } from '../context/AppContext';
import { useBlogData } from '../context/BlogDataContext';
import { ArticleAutosaveDraft, BlogCategoryId, BlogPost, BlogUser, PostStatus } from '../lib/blog';
import {
  clearArticleAutosaveDraft,
  createPost,
  createUser,
  deletePost,
  deleteUser,
  getArticleAutosaveDraft,
  listUsers,
  updatePost,
  updateUser
} from '../lib/blogApi';
import { createDraftAutosaveRepository } from '../lib/draftAutosave';
import { normalizeImageUrl } from '../lib/imageUrl';
import { formatTagInput, parseTagInput } from '../lib/tags';

const draftRepository = createDraftAutosaveRepository();

const EMPTY_FORM = {
  title: '',
  summary: '',
  category: 'life' as BlogCategoryId,
  tags: [] as string[],
  content: '',
  status: 'draft' as PostStatus,
  cover: 'life' as BlogCategoryId,
  coverImage: ''
};

const EMPTY_ADMIN_USER_FORM = {
  username: '',
  password: '',
  nickname: '',
  permission: 'reader' as BlogUser['permission']
};

export function AdminPage() {
  const [searchParams] = useSearchParams();
  const { notify } = useApp();
  const { posts, loadPosts } = useBlogData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');
  const [editorChangeVersion, setEditorChangeVersion] = useState(0);
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit');
  const [adminStatusFilter, setAdminStatusFilter] = useState<'all' | PostStatus>('all');
  const [expandedAdminPostId, setExpandedAdminPostId] = useState<string | null>(null);
  const [adminPanelOpen, setAdminPanelOpen] = useState({ content: false, users: false, about: false });
  const [adminUsers, setAdminUsers] = useState<BlogUser[]>([]);
  const [adminUserForm, setAdminUserForm] = useState(EMPTY_ADMIN_USER_FORM);
  const [serverDraft, setServerDraft] = useState<ArticleAutosaveDraft | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<ArticleAutosaveDraft | null>(null);

  const loadedAdminUsersRef = useRef(false);
  const handledEditQueryRef = useRef('');

  const adminPosts = posts.filter((post) => adminStatusFilter === 'all' || post.status === adminStatusFilter);
  const editingPost = editingId ? posts.find((post) => post.id === editingId) ?? null : null;
  const revisionHistory = useRevisionHistory(editingId);
  const editPostQuery = searchParams.get('edit');

  useEffect(() => {
    if (loadedAdminUsersRef.current) return;
    loadedAdminUsersRef.current = true;
    void loadAdminUsers();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getArticleAutosaveDraft()
      .then((draft) => {
        if (!cancelled) setServerDraft(draft);
      })
      .catch(() => {
        if (!cancelled) setServerDraft(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const autosaveDraft = useMemo(() => ({ ...form, tags: parseTagInput(tagInput) }), [form, tagInput]);
  const { note: autosaveNote, saveNow: saveDraftNow } = useDraftAutosave({
    enabled: true,
    editingId,
    draft: autosaveDraft,
    changeVersion: editorChangeVersion,
    onBoundEditingId: (postId) => {
      setEditingId(postId);
      setExpandedAdminPostId(postId);
      void loadPosts(true);
    },
    onSaved: setServerDraft
  });

  const loadAdminUsers = async () => {
    try {
      const users = await listUsers();
      setAdminUsers(users);
    } catch (error) {
      loadedAdminUsersRef.current = false;
      notify('error', error instanceof Error ? error.message : '用户列表加载失败');
    }
  };

  const updateForm = (patch: Partial<typeof EMPTY_FORM>) => {
    setForm((current) => ({ ...current, ...patch }));
    setEditorChangeVersion((current) => current + 1);
  };

  const updateTagInput = (value: string) => {
    setTagInput(value);
    updateForm({ tags: parseTagInput(value) });
  };

  const markdownEditor = useMarkdownEditor({
    content: form.content,
    updateForm,
    notify
  });

  const startCreate = () => {
    setRecoveryDraft(null);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setTagInput('');
    setEditorChangeVersion(0);
    setEditorTab('edit');
    notify('info', '已进入新建文章模式');
  };

  const startEdit = (post: BlogPost, showNotice = true) => {
    const localEnvelope = draftRepository.loadEnvelope();
    const localDraft = localEnvelope
      ? { editingId: localEnvelope.editingId, updatedAt: localEnvelope.updatedAt, draft: localEnvelope.draft }
      : null;
    const recoveryCandidate = needsDraftRecovery(serverDraft, post)
      ? serverDraft
      : needsDraftRecovery(localDraft, post)
        ? localDraft
        : null;
    setRecoveryDraft(recoveryCandidate);
    setEditingId(post.id);
    setForm({
      title: post.title,
      summary: post.summary,
      category: post.category,
      tags: post.tags,
      content: post.content,
      status: post.status,
      cover: post.cover,
      coverImage: post.coverImage ?? ''
    });
    setTagInput(formatTagInput(post.tags));
    setEditorChangeVersion(0);
    setEditorTab('edit');
    if (showNotice) notify('info', `正在编辑：${post.title}`);
  };

  const selectPostForEditing = async (post: BlogPost) => {
    await saveDraftNow();
    startEdit(post);
  };

  const selectNewPost = async () => {
    await saveDraftNow();
    startCreate();
  };

  useEffect(() => {
    if (!editPostQuery) return;
    const post = posts.find((item) => item.id === editPostQuery || item.slug === editPostQuery);
    if (!post) return;

    const queryKey = `${editPostQuery}:${post.updatedAt}`;
    if (handledEditQueryRef.current === queryKey && editingId === post.id) return;
    handledEditQueryRef.current = queryKey;

    setAdminPanelOpen((current) => ({ ...current, content: true }));
    setAdminStatusFilter('all');
    setExpandedAdminPostId(post.id);
    startEdit(post);
    window.setTimeout(() => {
      const editorPanel = document.querySelector('.editor-panel') as HTMLElement | null;
      editorPanel?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [editPostQuery, editingId, posts]);

  const savePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) return notify('error', '请填写文章标题');
    if (!form.summary.trim()) return notify('error', '请填写文章摘要');
    if (!form.content.trim()) return notify('error', '请填写文章正文');

    const coverImageInput = form.coverImage?.trim() ?? '';
    const coverImage = coverImageInput ? normalizeImageUrl(coverImageInput) : '';
    if (coverImageInput && !coverImage) {
      notify('error', '请输入 HTTPS 图片 URL，或使用本站图床链接');
      return;
    }

    const payload = {
      title: form.title,
      summary: form.summary,
      category: form.category,
      tags: parseTagInput(tagInput),
      content: form.content,
      status: form.status,
      cover: form.category,
      coverImage: coverImage || ''
    };

    try {
      const autosaved = await saveDraftNow();
      const postId = autosaved?.editingId ?? editingId ?? serverDraft?.editingId;
      const saved = postId ? await updatePost(postId, payload) : await createPost(payload);
      await loadPosts(true);
      notify('success', saved.status === 'published' ? '文章已保存并发布' : '文章已保存为草稿');
      draftRepository.clear();
      await clearArticleAutosaveDraft().catch(() => undefined);
      setServerDraft(null);
      startEdit(saved, false);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文章保存失败');
    }
  };

  const removePost = async (post: BlogPost) => {
    const confirmed = window.confirm(`确认删除《${post.title}》吗？此操作不可撤销。`);
    if (!confirmed) return;
    try {
      await deletePost(post.id);
      await loadPosts(true);
      notify('success', '文章已删除');
      if (editingId === post.id) startCreate();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '文章删除失败');
    }
  };

  const updateStatus = async (id: string, status: PostStatus) => {
    try {
      const updated = await updatePost(id, { status });
      await loadPosts(true);
      if (updated && editingId === id) startEdit(updated, false);
      notify('success', status === 'published' ? '文章已发布' : status === 'withdrawn' ? '文章已撤回' : '文章状态已更新');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '状态更新失败');
    }
  };

  const saveAdminUser = async (user: BlogUser) => {
    try {
      const updated = await updateUser(user.id, user);
      setAdminUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      notify('success', '用户资料已更新');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '用户更新失败');
    }
  };

  const submitAdminUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminUserForm.username.trim() || !adminUserForm.password.trim()) {
      notify('error', '请填写用户名和密码');
      return;
    }
    try {
      const user = await createUser(adminUserForm);
      setAdminUsers((current) => [user, ...current]);
      setAdminUserForm(EMPTY_ADMIN_USER_FORM);
      notify('success', '用户已创建');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '用户创建失败');
    }
  };

  const removeAdminUser = async (user: BlogUser) => {
    if (!window.confirm(`确认删除用户 ${user.username} 吗？`)) return;
    try {
      await deleteUser(user.id);
      setAdminUsers((current) => current.filter((item) => item.id !== user.id));
      notify('success', '用户已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '用户删除失败');
    }
  };

  const updateAdminUser = (userId: string, patch: Partial<Pick<BlogUser, 'nickname' | 'permission'>>) => {
    setAdminUsers((current) => current.map((item) => (item.id === userId ? { ...item, ...patch } : item)));
  };

  return (
    <section className="admin-layout">
      {recoveryDraft ? (
        <DraftRecoveryDialog
          onDiscard={() => {
            void clearArticleAutosaveDraft();
            draftRepository.clear();
            setRecoveryDraft(null);
            setServerDraft(null);
          }}
          onRestore={() => {
            setForm({ ...recoveryDraft.draft, coverImage: recoveryDraft.draft.coverImage || '' });
            setTagInput(formatTagInput(recoveryDraft.draft.tags));
            setEditorChangeVersion(0);
            setRecoveryDraft(null);
          }}
          snapshot={recoveryDraft}
        />
      ) : null}
      <aside className="admin-list">
        <ArticleManager
          adminPanelOpen={adminPanelOpen.content}
          adminPosts={adminPosts}
          adminStatusFilter={adminStatusFilter}
          expandedAdminPostId={expandedAdminPostId}
          onCreate={() => void selectNewPost()}
          onEdit={(post) => void selectPostForEditing(post)}
          onRemove={removePost}
          onSetStatusFilter={setAdminStatusFilter}
          onToggleExpandedPost={(postId) => setExpandedAdminPostId((current) => (current === postId ? null : postId))}
          onTogglePanel={() => setAdminPanelOpen((current) => ({ ...current, content: !current.content }))}
          onUpdateStatus={updateStatus}
        />
        <UserManager
          adminPanelOpen={adminPanelOpen.users}
          adminUserForm={adminUserForm}
          adminUsers={adminUsers}
          onChangeCreateForm={(patch) => setAdminUserForm((current) => ({ ...current, ...patch }))}
          onChangeUser={updateAdminUser}
          onRemoveUser={removeAdminUser}
          onSaveUser={saveAdminUser}
          onSubmit={submitAdminUser}
          onTogglePanel={() => setAdminPanelOpen((current) => ({ ...current, users: !current.users }))}
        />
        <AboutManager
          adminPanelOpen={adminPanelOpen.about}
          notify={notify}
          onTogglePanel={() => setAdminPanelOpen((current) => ({ ...current, about: !current.about }))}
        />
      </aside>

      <EditorPanel
        autosaveNote={autosaveNote}
        contentEditorRef={markdownEditor.contentEditorRef}
        coverImageInputRef={markdownEditor.coverImageInputRef}
        editorTab={editorTab}
        editingId={editingId}
        form={form}
        imageInputRef={markdownEditor.imageInputRef}
        onEditorKeyDown={markdownEditor.handleEditorKeyDown}
        onInsertImage={(file) => void markdownEditor.insertImageFile(file)}
        onInsertSnippet={markdownEditor.insertMarkdownSnippet}
        onPasteImage={markdownEditor.pasteImageIntoEditor}
        onSetEditorTab={setEditorTab}
        onSubmit={savePost}
        onUpdateForm={updateForm}
        onUpdateTagInput={updateTagInput}
        onUploadCoverImage={(file) => void markdownEditor.uploadCoverImageFile(file)}
        previewAction={
          <ArticlePreviewAction
            disabled={!form.title.trim() && !form.summary.trim() && !form.content.trim()}
            editingId={editingId}
            onFlush={saveDraftNow}
          />
        }
        tagInput={tagInput}
        uploadingImage={markdownEditor.uploadingImage}
        workflowContent={editingId ? (
          <>
            <PublishScheduleControl
              onCancel={async () => {
                const updated = await cancelSchedule(editingId);
                await loadPosts(true);
                startEdit(updated, false);
              }}
              onRetry={async () => {
                const updated = await retrySchedule(editingId);
                await loadPosts(true);
                startEdit(updated, false);
              }}
              onSchedule={async (scheduledAt) => {
                const updated = await schedulePost(editingId, scheduledAt);
                await loadPosts(true);
                startEdit(updated, false);
              }}
              post={editingPost}
            />
            <RevisionPanel
              comparison={revisionHistory.comparison}
              deletingRevisionId={revisionHistory.deletingRevisionId}
              error={revisionHistory.error}
              loading={revisionHistory.loading}
              onCloseComparison={revisionHistory.closeComparison}
              onCompare={(revisionId) => void revisionHistory.compare(revisionId)}
              onRemove={(revision) => {
                if (revision.isProtected) {
                  notify('info', '这是发布或恢复流程的关键版本，系统会保留它以防止内容丢失');
                  return;
                }
                if (!window.confirm(`确认删除《${revision.title || '未命名文章'}》的这个历史版本吗？`)) return;
                void revisionHistory.remove(revision.id)
                  .then(() => notify('success', '历史版本已删除'))
                  .catch((error) => notify('error', error instanceof Error ? error.message : '版本删除失败'));
              }}
              onRestore={(revisionId) => void revisionHistory.restore(revisionId).then(async (restored) => {
                await loadPosts(true);
                startEdit(restored, false);
                await revisionHistory.reload();
                notify('success', '历史版本已恢复为草稿');
              }).catch((error) => notify('error', error instanceof Error ? error.message : '版本恢复失败'))}
              revisions={revisionHistory.revisions}
            />
          </>
        ) : null}
      />
    </section>
  );
}
