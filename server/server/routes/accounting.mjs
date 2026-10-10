import { Hono } from 'hono';
import { requireAdmin } from '../middleware/auth.mjs';

const app = new Hono();

app.all('/login', (c) => c.notFound());
app.all('/session', (c) => c.notFound());
app.use('*', requireAdmin);

app.get('/month', (c) => {
  const accountingStore = c.get('accountingStore');
  return c.json(accountingStore.getMonthData({
    month: c.req.query('month') || undefined,
    type: c.req.query('type') || 'all',
    category: c.req.query('category') || 'all'
  }));
});

app.post('/entries', async (c) => {
  const accountingStore = c.get('accountingStore');
  try {
    const body = await c.req.json();
    return c.json({ entry: accountingStore.createEntry(body) }, 201);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Invalid request body' }, 400);
  }
});

app.put('/entries/:id', async (c) => {
  const accountingStore = c.get('accountingStore');
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const entry = accountingStore.updateEntry(id, body);
    return c.json(entry ? { entry } : { ok: false, message: 'Entry not found' }, entry ? 200 : 404);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Invalid request body' }, 400);
  }
});

app.delete('/entries/:id', (c) => {
  const accountingStore = c.get('accountingStore');
  const id = c.req.param('id');
  const removed = accountingStore.removeEntry(id);
  return c.json(removed ? { ok: true } : { ok: false, message: 'Entry not found' }, removed ? 200 : 404);
});

app.post('/categories', async (c) => {
  const accountingStore = c.get('accountingStore');
  try {
    const body = await c.req.json();
    return c.json({ category: accountingStore.createCategory(body) }, 201);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Invalid request body' }, 400);
  }
});

app.put('/categories/:id', async (c) => {
  const accountingStore = c.get('accountingStore');
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const category = accountingStore.updateCategory(id, body);
    return c.json(category ? { category } : { ok: false, message: 'Category not found' }, category ? 200 : 404);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Category update failed' }, 400);
  }
});

app.delete('/categories/:id', (c) => {
  const accountingStore = c.get('accountingStore');
  const id = c.req.param('id');
  try {
    const removed = accountingStore.removeCategory(id);
    return c.json(removed ? { ok: true } : { ok: false, message: 'Category not found' }, removed ? 200 : 404);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Category delete failed' }, 400);
  }
});

app.put('/settings', async (c) => {
  const accountingStore = c.get('accountingStore');
  try {
    const body = await c.req.json();
    accountingStore.updateSettings(body);
    return c.json(accountingStore.getMonthData({ month: body.month }));
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Invalid request body' }, 400);
  }
});

export const accountingRoutes = app;
