import { afterEach, describe, expect, it, vi } from 'vitest';
import { startScheduledPublishing } from './scheduledPublishing.mjs';

afterEach(() => {
  vi.useRealTimers();
});

describe('scheduled publishing job', () => {
  it('runs immediately and every minute, then stops cleanly', async () => {
    vi.useFakeTimers();
    const service = { runDue: vi.fn(() => ({ published: [], failed: [] })) };

    const job = startScheduledPublishing({ service, logger: { error: vi.fn() } });
    expect(service.runDue).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(service.runDue).toHaveBeenCalledTimes(3);

    job.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(service.runDue).toHaveBeenCalledTimes(3);
  });
});
