import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiNotFound } from '../middleware/apiNotFound.mjs';
import { accountingRoutes } from './accounting.mjs';

const reader = { id: 'reader-1', permission: 'reader' };
const admin = { id: 'admin-1', permission: 'admin' };

let authSession;
let accountingStore;
let app;

beforeEach(() => {
  authSession = null;
  accountingStore = {
    getMonthData: vi.fn(() => ({ month: '2026-07', entries: [], categories: [] })),
    createEntry: vi.fn((body) => ({ id: 'entry-1', ...body })),
    updateEntry: vi.fn(),
    removeEntry: vi.fn(),
    createCategory: vi.fn((body) => ({ id: 'category-1', ...body })),
    updateCategory: vi.fn(),
    removeCategory: vi.fn(),
    updateSettings: vi.fn(),
  };
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('authSession', authSession);
    c.set('accountingStore', accountingStore);
    await next();
  });
  app.route('/api/accounting', accountingRoutes);
  app.all('/api/*', apiNotFound);
});

describe('accounting role authorization', () => {
  it.each([
    ['month', 'GET', '/api/accounting/month', undefined],
    ['entries', 'POST', '/api/accounting/entries', { type: 'expense', amount: 12 }],
    ['categories', 'POST', '/api/accounting/categories', { name: 'Books' }],
    ['settings', 'PUT', '/api/accounting/settings', { month: '2026-07', budget: 100 }],
  ])('rejects anonymous and reader access to %s, then allows an administrator', async (_group, method, path, body) => {
    const request = () => app.request(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    expect((await request()).status).toBe(401);
    authSession = { user: reader };
    expect((await request()).status).toBe(403);
    authSession = { user: admin };
    expect((await request()).status).toBe(method === 'POST' ? 201 : 200);
  });

  it.each(['/api/accounting/login', '/api/accounting/session'])('returns 404 for removed legacy endpoint %s', async (path) => {
    const response = await app.request(path, { method: path.endsWith('/login') ? 'POST' : 'GET' });

    expect(response.status).toBe(404);
  });
});
