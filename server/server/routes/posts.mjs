import { Hono } from 'hono';
import { PUBLIC_DYNAMIC_CACHE } from '../httpCache.mjs';
import { currentUser, isAdmin, requireAdmin } from '../middleware/auth.mjs';

const app = new Hono();

app.use('/', (c, next) => {
  return c.req.query('includeDrafts') === '1' ? requireAdmin(c, next) : next();
});

app.get('/', (c) => {
  const postService = c.get('postService');
  const includeDrafts = c.req.query('includeDrafts') === '1';
  const summaryOnly = c.req.query('summary') === '1' && !includeDrafts;
  const searchParams = new URL(c.req.url).searchParams;
  const paginatedPublicQuery =
    !includeDrafts && ['limit', 'cursor', 'q', 'tags', 'category', 'date'].some((key) => searchParams.has(key));
  c.header(
    'Cache-Control',
    includeDrafts ? 'private, no-store' : PUBLIC_DYNAMIC_CACHE
  );

  if (paginatedPublicQuery) {
    try {
      return c.json(postService.queryPublicPosts(searchParams));
    } catch (error) {
      if (error?.status === 400) {
        return c.json({ ok: false, message: error.message }, 400);
      }
      throw error;
    }
  }

  const posts = summaryOnly
    ? postService.listPostSummaries({ includeDrafts: false })
    : postService.listPosts({ includeDrafts });
  return c.json({
    posts
  });
});

app.post('/', requireAdmin, async (c) => {
  const postService = c.get('postService');

  try {
    const body = await c.req.json();
    return c.json({ post: postService.createPost(body, { editorUserId: currentUser(c).id }) }, 201);
  } catch {
    return c.json({ ok: false, message: 'Invalid request body' }, 400);
  }
});

app.get('/:id', (c) => {
  const postService = c.get('postService');
  const id = c.req.param('id');
  const post = postService.getPost(id);
  if (!post || (post.status !== 'published' && !isAdmin(c))) {
    return c.json({ ok: false, message: 'Post not found' }, 404);
  }
  c.header('Cache-Control', post.status === 'published' ? PUBLIC_DYNAMIC_CACHE : 'private, no-store');
  return c.json({ post });
});

app.put('/:id', requireAdmin, async (c) => {
  const postService = c.get('postService');

  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const post = postService.updatePost(id, body, { editorUserId: currentUser(c).id });
    return c.json(post ? { post } : { ok: false, message: 'Post not found' }, post ? 200 : 404);
  } catch {
    return c.json({ ok: false, message: 'Invalid request body' }, 400);
  }
});

app.delete('/:id', requireAdmin, (c) => {
  const postService = c.get('postService');

  const id = c.req.param('id');
  const removed = postService.removePost(id);
  return c.json(removed ? { ok: true } : { ok: false, message: 'Post not found' }, removed ? 200 : 404);
});

// Comments endpoints
app.get('/:postId/comments', (c) => {
  const postService = c.get('postService');
  const postId = c.req.param('postId');
  return c.json({ comments: postService.listComments(postId) });
});

app.post('/:postId/comments', async (c) => {
  const postService = c.get('postService');
  const postId = c.req.param('postId');
  const user = currentUser(c);
  if (!user) {
    return c.json({ ok: false, message: '请先登录后再评论' }, 401);
  }

  try {
    const body = await c.req.json();
    const comment = postService.createComment(postId, body, user);
    return c.json(comment ? { comment } : { ok: false, message: 'Post not found' }, comment ? 201 : 404);
  } catch (error) {
    return c.json({ ok: false, message: error?.message || 'Invalid request body' }, 400);
  }
});

app.put('/:postId/comments/:commentId', async (c) => {
  const postService = c.get('postService');
  const postId = c.req.param('postId');
  const commentId = c.req.param('commentId');
  const user = currentUser(c);
  if (!user) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.json();
    const comment = postService.updateComment(commentId, body, user);
    return c.json(comment ? { comment } : { ok: false, message: 'Forbidden' }, comment ? 200 : 403);
  } catch (error) {
    return c.json({ ok: false, message: error?.message || 'Invalid request body' }, 400);
  }
});

app.delete('/:postId/comments/:commentId', (c) => {
  const postService = c.get('postService');
  const postId = c.req.param('postId');
  const commentId = c.req.param('commentId');
  const user = currentUser(c);
  if (!user) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const removed = postService.removeComment(commentId, user);
  return c.json(removed ? { ok: true } : { ok: false, message: 'Forbidden' }, removed ? 200 : 403);
});

export const postsRoutes = app;
