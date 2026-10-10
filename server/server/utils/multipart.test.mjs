import { describe, expect, it } from 'vitest';
import { parseMultipartFile } from './multipart.mjs';

function multipartBody({ boundary, filename, folderId = '', content = 'payload' }) {
  const chunks = [
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from('Content-Disposition: form-data; name="file"; filename="'),
    Buffer.from(filename, 'utf8'),
    Buffer.from('"\r\nContent-Type: application/octet-stream\r\n\r\n'),
    Buffer.from(content, 'utf8'),
    Buffer.from(`\r\n--${boundary}\r\n`),
    Buffer.from('Content-Disposition: form-data; name="folderId"\r\n\r\n'),
    Buffer.from(folderId, 'utf8'),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ];
  return Buffer.concat(chunks);
}

describe('multipart parser', () => {
  it('keeps UTF-8 filenames from browser form uploads readable', () => {
    const boundary = '----kitepop';
    const upload = parseMultipartFile(
      multipartBody({ boundary, filename: '复习资料.docx', folderId: 'folder-study' }),
      `multipart/form-data; boundary=${boundary}`
    );

    expect(upload.originalName).toBe('复习资料.docx');
    expect(upload.folderId).toBe('folder-study');
    expect(upload.buffer.toString('utf8')).toBe('payload');
  });
});
