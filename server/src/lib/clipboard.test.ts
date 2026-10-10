import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back when navigator.clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand
    });

    await expect(copyTextToClipboard('http://example.test/raw.php')).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });
});
