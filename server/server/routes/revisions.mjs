import { Hono } from 'hono';
import { currentUser, requireAdmin } from '../middleware/auth.mjs';

const app = new Hono();
app.use('*', requireAdmin);

function failure(c, error) {
  const message = error?.message || 'Revision operation failed';
  return c.json({ ok: false, message }, message.includes('not found') ? 404 : 400);
}

app.get('/:postId/revisions', (c) => {
  try {
    return c.json({ revisions: c.get('postRevisionService').list(c.req.param('postId')) });
  } catch (error) {
    return failure(c, error);
  }
});

app.get('/:postId/revisions/:revisionId', (c) => {
  try {
    return c.json({ revision: c.get('postRevisionService').get(c.req.param('postId'), c.req.param('revisionId')) });
  } catch (error) {
    return failure(c, error);
  }
});

app.get('/:postId/revisions/:revisionId/compare', (c) => {
  try {
    return c.json(c.get('postRevisionService').compare(c.req.param('postId'), c.req.param('revisionId')));
  } catch (error) {
    return failure(c, error);
  }
});

app.post('/:postId/revisions/:revisionId/restore', (c) => {
  try {
    const post = c.get('postRevisionService').restore(c.req.param('postId'), c.req.param('revisionId'), {
      editorUserId: currentUser(c).id
    });
    return c.json({ post });
  } catch (error) {
    return failure(c, error);
  }
});

app.delete('/:postId/revisions/:revisionId', (c) => {
  try {
    const service = c.get('postRevisionService');
    service.get(c.req.param('postId'), c.req.param('revisionId'));
    const removed = service.remove(c.req.param('revisionId'));
    return c.json(removed ? { ok: true } : { ok: false, message: 'Protected revision cannot be deleted' }, removed ? 200 : 409);
  } catch (error) {
    return failure(c, error);
  }
});

export const revisionsRoutes = app;
