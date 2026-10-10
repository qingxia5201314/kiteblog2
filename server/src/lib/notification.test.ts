import { describe, expect, it } from 'vitest';
import { createNotification } from './notification';

describe('notifications', () => {
  it('creates success notifications that auto dismiss after three seconds', () => {
    expect(createNotification('success', '保存成功')).toMatchObject({
      type: 'success',
      message: '保存成功',
      durationMs: 3000
    });
  });

  it('creates error notifications that auto dismiss after four seconds', () => {
    expect(createNotification('error', '后台口令不正确')).toMatchObject({
      type: 'error',
      message: '后台口令不正确',
      durationMs: 4000
    });
  });
});
