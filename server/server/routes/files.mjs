import { Hono } from 'hono';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { requireAdmin } from '../middleware/auth.mjs';
import { UploadError } from '../chunkedUploadStore.mjs';
import { createPartialContentHeaders, createRawFileHeaders } from '../fileDownloadHeaders.mjs';
import { parseMultipartFile } from '../utils/multipart.mjs';

const app = new Hono();
export const DEFAULT_FILE_UPLOAD_LIMIT_BYTES = 0;

export function getFileUploadLimitBytes(env = process.env) {
  return Number(env.FILE_UPLOAD_LIMIT || DEFAULT_FILE_UPLOAD_LIMIT_BYTES);
}

function parseRangeHeader(rangeHeader, fileSize) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null;

  const [rawStart, rawEnd] = rangeHeader.slice(6).split('-', 2);
  if (rawStart === '' && rawEnd === '') return null;

  if (rawStart === '') {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(fileSize - suffixLength, 0);
    return { start, end: Math.max(fileSize - 1, 0) };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : fileSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < start || start >= fileSize) return null;

  return { start, end: Math.min(end, fileSize - 1) };
}

// Bridge a Node ReadStream into a web ReadableStream with explicit lifecycle
// handling. Handing a raw Node stream to `new Response()` makes undici build a
// byte stream it can close twice when the client aborts, which throws an
// uncaught ERR_INVALID_STATE and kills the process. Owning the controller here
// keeps close/error idempotent and ties teardown to the request abort signal.
function toWebStream(nodeStream, signal) {
  let settled = false;
  const settle = (controller, error) => {
    if (settled) return;
    settled = true;
    try {
      if (error) controller.error(error);
      else controller.close();
    } catch {
      /* controller already closed by the runtime */
    }
  };

  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) => {
        if (settled) return;
        try {
          controller.enqueue(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
        } catch {
          settled = true;
          nodeStream.destroy();
        }
      });
      nodeStream.once('end', () => settle(controller));
      nodeStream.once('error', (error) => settle(controller, error));

      if (signal) {
        if (signal.aborted) {
          settled = true;
          nodeStream.destroy();
        } else {
          signal.addEventListener(
            'abort',
            () => {
              settled = true;
              nodeStream.destroy();
            },
            { once: true }
          );
        }
      }
    },
    cancel() {
      settled = true;
      nodeStream.destroy();
    }
  });
}

function publicFolder(folder) {
  return folder
    ? {
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt
      }
    : null;
}

function publicFile(file) {
  return {
    id: file.id,
    originalName: file.originalName,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    uploadedAt: file.uploadedAt,
    folderId: file.folderId || ''
  };
}

function publicFolderView(view) {
  return {
    folder: publicFolder(view.folder),
    breadcrumbs: view.breadcrumbs.map(publicFolder),
    folders: view.folders.map(publicFolder),
    files: view.files.map(publicFile)
  };
}

function uploadOwnerId(c) {
  return String(c.get('authSession')?.user?.id ?? '');
}

function uploadErrorResponse(c, error) {
  const status = error instanceof UploadError ? error.status : 400;
  return c.json({ ok: false, message: error instanceof Error ? error.message : 'Upload failed' }, status);
}

app.get('/raw/:id', async (c) => {
  const fileService = c.get('fileService');
  const requestedId = c.req.param('id');
  const token = c.req.query('token') || '';
  const extensionSeparator = requestedId.lastIndexOf('.');
  const hasExtension = extensionSeparator > 0 && extensionSeparator < requestedId.length - 1;
  const file = hasExtension
    ? fileService.getPublicMedia(
        requestedId.slice(0, extensionSeparator),
        requestedId.slice(extensionSeparator + 1)
      )
    : fileService.getFileForToken(requestedId, token);

  if (!file) {
    return c.json({ ok: false, message: 'File not found' }, 404);
  }

  const fileStats = await stat(file.filePath);
  const sizedFile = { ...file, sizeBytes: fileStats.size };
  const range = parseRangeHeader(c.req.header('range') || '', fileStats.size);
  const headers = range
    ? createPartialContentHeaders(sizedFile, range)
    : createRawFileHeaders(sizedFile);
  const stream = range
    ? createReadStream(file.filePath, { start: range.start, end: range.end })
    : createReadStream(file.filePath);

  return new Response(toWebStream(stream, c.req.raw.signal), {
    status: range ? 206 : 200,
    headers: new Headers(headers)
  });
});

app.get('/', requireAdmin, (c) => {
  const fileService = c.get('fileService');
  const folderId = c.req.query('folderId') || '';

  try {
    return c.json(publicFolderView(fileService.listFolder(folderId)));
  } catch (error) {
    return c.json(
      { ok: false, message: error instanceof Error ? error.message : 'Folder not found' },
      404
    );
  }
});

app.post('/editor-upload', async (c) => {
  if (c.req.header('x-kitepop-editor-token') !== (process.env.ADMIN_PASSWORD || '')) return c.json({ ok: false, message: 'Unauthorized' }, 403);
  try {
    const payload = await c.req.json();
    const data = String(payload?.data || '');
    const match = data.match(/^data:([^;]+);base64,(.*)$/s);
    if (!match || !match[2]) return c.json({ ok: false, message: 'Invalid image data' }, 400);
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) return c.json({ ok: false, message: 'Empty image data' }, 400);
    const file = await c.get('fileService').saveFile({
      originalName: payload?.filename || 'editor-upload.bin',
      contentType: match[1],
      buffer,
      folderId: String(payload?.folderId || '')
    });
    const link = c.get('fileService').createAccessLink(file.id);
    return c.json({ file: publicFile(file), url: link?.path || '' }, 201);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Editor upload failed' }, 400);
  }
});

app.post('/', requireAdmin, async (c) => {
  const fileService = c.get('fileService');
  const fileUploadLimitBytes = getFileUploadLimitBytes();

  try {
    const buffer = await c.req.arrayBuffer();

    if (fileUploadLimitBytes > 0 && buffer.byteLength > fileUploadLimitBytes) {
      return c.json({ ok: false, message: 'Request body too large' }, 413);
    }

    const contentType = c.req.header('content-type') || '';
    const upload = parseMultipartFile(Buffer.from(buffer), contentType);
    const file = await fileService.saveFile(upload);
    return c.json({ file: publicFile(file) }, 201);
  } catch (error) {
    return c.json(
      { ok: false, message: error instanceof Error ? error.message : 'Upload failed' },
      400
    );
  }
});

app.post('/uploads', requireAdmin, async (c) => {
  let payload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ ok: false, message: 'Invalid upload request' }, 400);
  }

  try {
    const upload = await c.get('chunkedUploads').create({
      ownerId: uploadOwnerId(c),
      fileName: payload?.fileName,
      contentType: payload?.contentType,
      sizeBytes: payload?.sizeBytes,
      folderId: payload?.folderId || '',
      limitBytes: getFileUploadLimitBytes()
    });
    return c.json({ upload }, 201);
  } catch (error) {
    return uploadErrorResponse(c, error);
  }
});

app.put('/uploads/:id/chunks/:index', requireAdmin, async (c) => {
  const contentLength = c.req.header('content-length');
  try {
    const result = await c.get('chunkedUploads').writeChunk({
      id: c.req.param('id'),
      ownerId: uploadOwnerId(c),
      index: c.req.param('index'),
      body: c.req.raw.body,
      contentLength: contentLength === undefined ? undefined : Number(contentLength)
    });
    return c.json({ ok: true, ...result });
  } catch (error) {
    return uploadErrorResponse(c, error);
  }
});

app.post('/uploads/:id/complete', requireAdmin, async (c) => {
  try {
    const file = await c.get('chunkedUploads').complete({ id: c.req.param('id'), ownerId: uploadOwnerId(c) });
    return c.json({ file: publicFile(file) }, 201);
  } catch (error) {
    return uploadErrorResponse(c, error);
  }
});

app.delete('/uploads/:id', requireAdmin, async (c) => {
  try {
    await c.get('chunkedUploads').abort({ id: c.req.param('id'), ownerId: uploadOwnerId(c) });
    return c.json({ ok: true });
  } catch (error) {
    return uploadErrorResponse(c, error);
  }
});

app.post('/:id/link', requireAdmin, (c) => {
  const fileService = c.get('fileService');
  const id = c.req.param('id');
  const link = fileService.createAccessLink(id);
  return c.json(link ? { link } : { ok: false, message: 'File not found' }, link ? 200 : 404);
});

app.post('/:id/preview-link', requireAdmin, (c) => {
  const fileService = c.get('fileService');
  const id = c.req.param('id');
  const link = fileService.createPreviewLink(id);
  return c.json(link ? { link } : { ok: false, message: 'File not found' }, link ? 200 : 404);
});

app.delete('/:id', requireAdmin, async (c) => {
  const fileService = c.get('fileService');
  const id = c.req.param('id');
  const removed = await fileService.removeFile(id);
  return c.json(removed ? { ok: true } : { ok: false, message: 'File not found' }, removed ? 200 : 404);
});

export const filesRoutes = app;
