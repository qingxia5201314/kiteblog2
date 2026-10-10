import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { requireAdmin } from '../middleware/auth.mjs';
import { createRawFileHeaders } from '../fileDownloadHeaders.mjs';
import { parseMultipartFile } from '../utils/multipart.mjs';

const app = new Hono();

function publicImage(image) {
  return {
    id: image.id,
    originalName: image.originalName,
    contentType: image.contentType,
    sizeBytes: image.sizeBytes,
    uploadedAt: image.uploadedAt,
    path: image.path
  };
}

async function serveRawImage(c) {
  const imageService = c.get('imageService');
  const id = c.req.param('id');
  const image = imageService.getImage(id);

  if (!image) {
    return c.json({ ok: false, message: 'Image not found' }, 404);
  }

  const etag = `"${image.id}-${image.sizeBytes}"`;
  const headers = {
    ...createRawFileHeaders(image),
    'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
    etag
  };
  if (c.req.header('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: new Headers(headers) });
  }
  if (c.req.method === 'HEAD') {
    return new Response(null, {
      headers: new Headers(headers)
    });
  }

  const buffer = await readFile(image.filePath);

  return new Response(buffer, {
    headers: new Headers(headers)
  });
}

// Public: raw image download
app.get('/raw/:id', serveRawImage);
app.on('HEAD', '/raw/:id', serveRawImage);

// Admin only routes
app.get('/', requireAdmin, (c) => {
  const imageService = c.get('imageService');
  return c.json({ images: imageService.listImages().map(publicImage) });
});

app.post('/', requireAdmin, async (c) => {
  const imageService = c.get('imageService');
  const imageUploadLimitBytes = Number(process.env.IMAGE_UPLOAD_LIMIT || 0);

  try {
    const buffer = await c.req.arrayBuffer();

    // Check size limit
    if (imageUploadLimitBytes > 0 && buffer.byteLength > imageUploadLimitBytes) {
      return c.json({ ok: false, message: 'Request body too large' }, 413);
    }

    const contentType = c.req.header('content-type') || '';
    const upload = parseMultipartFile(Buffer.from(buffer), contentType);
    const image = await imageService.saveImage(upload);
    return c.json({ image: publicImage(image) }, 201);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Image upload failed' }, 400);
  }
});

app.delete('/:id', requireAdmin, async (c) => {
  const imageService = c.get('imageService');
  const id = c.req.param('id');
  const removed = await imageService.removeImage(id);
  return c.json(removed ? { ok: true } : { ok: false, message: 'Image not found' }, removed ? 200 : 404);
});

export const imagesRoutes = app;
