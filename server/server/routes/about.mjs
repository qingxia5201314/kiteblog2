import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => {
  c.header('Cache-Control', 'public, max-age=0, must-revalidate');
  return c.json({ profile: c.get('aboutStore').get() });
});

export const aboutRoutes = app;
