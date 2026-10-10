import { Hono } from 'hono';
import { normalizeAboutProfile } from '../aboutModel.mjs';
import { currentUser, requireAdmin } from '../middleware/auth.mjs';
import { emitSecurityEvent } from '../securityLog.mjs';

const app = new Hono();

function userMutationFailure(c, error, fallback) {
  return c.json(
    { ok: false, message: error?.message || fallback },
    error?.code === 'LAST_ADMIN' ? 409 : 400
  );
}

app.get('/about', requireAdmin, (c) => {
  return c.json({ profile: c.get('aboutStore').get() });
});

app.put('/about', requireAdmin, async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, message: 'Invalid request body' }, 400);
  }

  let profile;
  try {
    profile = normalizeAboutProfile(body);
  } catch (error) {
    return c.json({ ok: false, message: error?.message || 'Invalid about profile' }, 400);
  }

  try {
    return c.json({ profile: c.get('aboutStore').save(profile) });
  } catch {
    return c.json({ ok: false, message: 'About save failed' }, 500);
  }
});

app.get('/article-draft', requireAdmin, (c) => {
  const draftService = c.get('draftService');
  const postId = c.req.query('postId');
  return c.json({ draft: postId ? draftService.getRecovery(postId) : draftService.get() });
});

app.put('/article-draft', requireAdmin, async (c) => {
  const draftService = c.get('draftService');
  try {
    const body = await c.req.json();
    return c.json({ draft: draftService.save(body) });
  } catch (error) {
    return c.json({ ok: false, message: error?.message || 'Draft save failed' }, 400);
  }
});

app.delete('/article-draft', requireAdmin, (c) => {
  c.get('draftService').discard();
  return c.json({ ok: true });
});

app.get('/article-preview/:id', requireAdmin, (c) => {
  const post = c.get('postService').getPost(c.req.param('id'));
  if (!post) return c.json({ ok: false, message: 'Post not found' }, 404);

  const snapshot = c.get('draftService').get();
  const preview = snapshot?.editingId === post.id
    ? { ...post, ...snapshot.draft, id: post.id, slug: post.slug, updatedAt: snapshot.updatedAt, status: 'draft' }
    : post;
  c.header('Cache-Control', 'private, no-store');
  return c.json({ post: preview });
});

app.put('/posts/:id/schedule', requireAdmin, async (c) => {
  try {
    const body = await c.req.json();
    const post = c.get('scheduledPublishService').schedule(c.req.param('id'), body.scheduledAt, {
      editorUserId: currentUser(c).id
    });
    return c.json({ post });
  } catch (error) {
    return c.json({ ok: false, message: error?.message || 'Schedule failed' }, 400);
  }
});

app.delete('/posts/:id/schedule', requireAdmin, (c) => {
  try {
    return c.json({
      post: c.get('scheduledPublishService').cancel(c.req.param('id'), {
        editorUserId: currentUser(c).id
      })
    });
  } catch (error) {
    return c.json({ ok: false, message: error?.message || 'Schedule cancellation failed' }, 400);
  }
});

app.post('/posts/:id/schedule/retry', requireAdmin, (c) => {
  try {
    return c.json({ post: c.get('scheduledPublishService').retry(c.req.param('id')) });
  } catch (error) {
    return c.json({ ok: false, message: error?.message || 'Scheduled publish retry failed' }, 400);
  }
});

// User CRUD (admin only)
app.get('/users', requireAdmin, (c) => {
  const userStore = c.get('userStore');
  return c.json({ users: userStore.listUsers() });
});

app.post('/users', requireAdmin, async (c) => {
  const userStore = c.get('userStore');
  try {
    const body = await c.req.json();
    return c.json({ user: await userStore.createUser(body) }, 201);
  } catch (error) {
    return c.json({ ok: false, message: error?.message || 'User create failed' }, 400);
  }
});

app.put('/users/:id', requireAdmin, async (c) => {
  const userStore = c.get('userStore');
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const previousUser = userStore.listUsers().find((user) => user.id === id);
    const user = userStore.updateUser(id, body);
    if (user && previousUser && user.permission !== previousUser.permission) {
      emitSecurityEvent(c.get('securityLog'), {
        type: 'permission_change',
        userId: currentUser(c).id,
        result: `target=${user.id};permission=${user.permission}`
      });
    }
    return c.json(user ? { user } : { ok: false, message: 'User not found' }, user ? 200 : 404);
  } catch (error) {
    return userMutationFailure(c, error, 'User update failed');
  }
});

app.delete('/users/:id', requireAdmin, (c) => {
  const userStore = c.get('userStore');
  const id = c.req.param('id');
  try {
    const removed = userStore.removeUser(id);
    if (removed) {
      emitSecurityEvent(c.get('securityLog'), {
        type: 'user_delete',
        userId: currentUser(c).id,
        result: `target=${id}`
      });
    }
    return c.json(removed ? { ok: true } : { ok: false, message: 'User not found' }, removed ? 200 : 404);
  } catch (error) {
    return userMutationFailure(c, error, 'User delete failed');
  }
});

export const adminRoutes = app;
