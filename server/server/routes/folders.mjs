import { Hono } from 'hono';
import { requireAdmin } from '../middleware/auth.mjs';

const app = new Hono();

function publicFolder(folder) {
  return folder ? {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt
  } : null;
}

app.post('/', requireAdmin, (c) => {
  const fileStore = c.get('fileStore');

  return c.req.json().then((body) => {
    try {
      const folder = fileStore.createFolder({
        name: body.name,
        parentId: body.parentId || ''
      });
      return c.json({ folder: publicFolder(folder) }, 201);
    } catch (error) {
      return c.json({ ok: false, message: error instanceof Error ? error.message : 'Invalid folder' }, 400);
    }
  }).catch(() => {
    return c.json({ ok: false, message: 'Invalid request body' }, 400);
  });
});

app.put('/:id', requireAdmin, (c) => {
  const fileStore = c.get('fileStore');
  const id = c.req.param('id');

  return c.req.json().then((body) => {
    try {
      const folder = fileStore.renameFolder(id, body.name);
      return c.json(folder ? { folder: publicFolder(folder) } : { ok: false, message: 'Folder not found' }, folder ? 200 : 404);
    } catch (error) {
      return c.json({ ok: false, message: error instanceof Error ? error.message : 'Invalid folder' }, 400);
    }
  }).catch(() => {
    return c.json({ ok: false, message: 'Invalid request body' }, 400);
  });
});

app.delete('/:id', requireAdmin, (c) => {
  const fileStore = c.get('fileStore');
  const id = c.req.param('id');

  try {
    const removed = fileStore.removeFolder(id);
    return c.json(removed ? { ok: true } : { ok: false, message: 'Folder not found' }, removed ? 200 : 404);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Folder delete failed' }, 400);
  }
});

export const folderRoutes = app;
