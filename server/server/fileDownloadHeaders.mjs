function asciiFilenameFallback(name) {
  const fallback = String(name || 'file')
    .replace(/[\r\n"\\]/g, '_')
    .replace(/[^\x20-\x7e]/g, '_')
    .trim();
  return fallback || 'file';
}

function encodeRfc5987(value) {
  return encodeURIComponent(String(value || 'file')).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function createRawFileHeaders(file) {
  const originalName = file.originalName || 'file';

  return {
    'content-type': file.contentType || 'application/octet-stream',
    'content-length': file.sizeBytes,
    'accept-ranges': 'bytes',
    'content-disposition': `inline; filename="${asciiFilenameFallback(originalName)}"; filename*=UTF-8''${encodeRfc5987(originalName)}`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  };
}

export function createPartialContentHeaders(file, range) {
  const headers = createRawFileHeaders(file);
  const start = Number(range?.start || 0);
  const end = Number(range?.end || 0);
  const total = Number(file.sizeBytes || 0);

  return {
    ...headers,
    'content-length': end >= start ? end - start + 1 : 0,
    'content-range': `bytes ${start}-${end}/${total}`
  };
}
