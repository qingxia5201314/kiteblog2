import { describe, expect, it } from 'vitest';
import { DEFAULT_FILE_UPLOAD_LIMIT_BYTES, getFileUploadLimitBytes } from './routes/files.mjs';

describe('file upload limit', () => {
  it('uses no app-layer file size limit by default', () => {
    expect(DEFAULT_FILE_UPLOAD_LIMIT_BYTES).toBe(0);
    expect(getFileUploadLimitBytes({})).toBe(DEFAULT_FILE_UPLOAD_LIMIT_BYTES);
  });

  it('keeps FILE_UPLOAD_LIMIT as an explicit override', () => {
    expect(getFileUploadLimitBytes({ FILE_UPLOAD_LIMIT: '1234' })).toBe(1234);
    expect(getFileUploadLimitBytes({ FILE_UPLOAD_LIMIT: '0' })).toBe(0);
  });
});
