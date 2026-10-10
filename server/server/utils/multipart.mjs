import { recoverUtf8Filename } from '../filenameEncoding.mjs';

export function parseMultipartFile(buffer, contentType) {
  const boundary = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] ?? String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) throw new Error('Missing multipart boundary');

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let cursor = buffer.indexOf(boundaryBuffer);
  let fileUpload = null;
  let folderId = '';
  while (cursor !== -1) {
    const partStart = cursor + boundaryBuffer.length;
    const nextBoundary = buffer.indexOf(boundaryBuffer, partStart);
    if (nextBoundary === -1) break;

    let part = buffer.subarray(partStart, nextBoundary);
    if (part.subarray(0, 2).toString() === '\r\n') part = part.subarray(2);
    if (part.subarray(part.length - 2).toString() === '\r\n') part = part.subarray(0, part.length - 2);

    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd !== -1) {
      const headerText = part.subarray(0, headerEnd).toString('latin1');
      const body = part.subarray(headerEnd + 4);
      const disposition = headerText.match(/^content-disposition:\s*([^\r\n]+)/im)?.[1] || '';
      const fieldName = disposition.match(/name="([^"]*)"/i)?.[1] || disposition.match(/name=([^;\r\n]+)/i)?.[1] || '';
      const originalName = disposition.match(/filename="([^"]*)"/i)?.[1] || disposition.match(/filename=([^;\r\n]+)/i)?.[1];
      if (originalName) {
        const partContentType = headerText.match(/^content-type:\s*([^\r\n]+)/im)?.[1]?.trim() || 'application/octet-stream';
        fileUpload = {
          originalName: recoverUtf8Filename(originalName),
          contentType: partContentType,
          buffer: body
        };
      } else if (fieldName === 'folderId') {
        folderId = body.toString('utf8').trim();
      }
    }

    cursor = nextBoundary;
  }

  if (fileUpload) return { ...fileUpload, folderId };
  throw new Error('No file found in upload');
}
