import { describe, expect, it } from 'vitest';
import { createPartialContentHeaders, createRawFileHeaders } from './fileDownloadHeaders.mjs';

describe('file download headers', () => {
  it('keeps the original filename for browser downloads', () => {
    const headers = createRawFileHeaders({
      originalName: 'pass.php',
      contentType: 'application/octet-stream',
      sizeBytes: 38
    });

    expect(headers['content-type']).toBe('application/octet-stream');
    expect(headers['content-length']).toBe(38);
    expect(headers['content-disposition']).toContain('inline');
    expect(headers['content-disposition']).toContain('filename="pass.php"');
    expect(headers['content-disposition']).toContain("filename*=UTF-8''pass.php");
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  it('builds partial content headers for range responses', () => {
    const headers = createPartialContentHeaders(
      {
        originalName: 'lesson.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1000
      },
      { start: 100, end: 299 }
    );

    expect(headers['content-type']).toBe('video/mp4');
    expect(headers['content-length']).toBe(200);
    expect(headers['content-range']).toBe('bytes 100-299/1000');
    expect(headers['accept-ranges']).toBe('bytes');
    expect(headers['content-disposition']).toContain('inline');
  });
});
