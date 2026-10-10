import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords.mjs';

describe('versioned password hashing', () => {
  it('hashes passwords with the fixed scrypt v1 format', async () => {
    const stored = await hashPassword('secret123');

    expect(stored).toMatch(/^scrypt\$v1\$32768\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  it('verifies scrypt v1 passwords without requesting a rehash', async () => {
    const stored = await hashPassword('secret123');

    await expect(verifyPassword('secret123', stored)).resolves.toEqual({
      valid: true,
      needsRehash: false,
    });
    await expect(verifyPassword('wrong-password', stored)).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it('verifies legacy sha256 hashes and requests a rehash only on success', async () => {
    const salt = '0123456789abcdef0123456789abcdef';
    const digest = createHash('sha256').update(`${salt}:secret123`).digest('hex');
    const stored = `${salt}:${digest}`;

    await expect(verifyPassword('secret123', stored)).resolves.toEqual({
      valid: true,
      needsRehash: true,
    });
    await expect(verifyPassword('wrong-password', stored)).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it.each([
    ['non-hex', 'g'.repeat(32)],
    ['too short', 'a'.repeat(31)],
    ['too long', 'a'.repeat(33)],
    ['containing an extra colon', `${'a'.repeat(16)}:${'b'.repeat(16)}`],
  ])('rejects legacy hashes with %s salts', async (_description, salt) => {
    const digest = createHash('sha256').update(`${salt}:secret123`).digest('hex');

    await expect(verifyPassword('secret123', `${salt}:${digest}`)).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it.each([
    'scrypt$v2$32768$8$1$0123456789abcdef0123456789abcdef$' + '00'.repeat(64),
    'scrypt$v1$2147483648$8$1$0123456789abcdef0123456789abcdef$' + '00'.repeat(64),
    'scrypt$v1$32768$16$1$0123456789abcdef0123456789abcdef$' + '00'.repeat(64),
    'scrypt$v1$32768$8$2$0123456789abcdef0123456789abcdef$' + '00'.repeat(64),
    'scrypt$v1$32768$8$1$not-hex$' + '00'.repeat(64),
    'scrypt$v1$32768$8$1$0123456789abcdef0123456789abcdef$short',
    'scrypt$v1$32768$8$1',
  ])('safely rejects unsupported or malformed scrypt hashes: %s', async (stored) => {
    await expect(verifyPassword('secret123', stored)).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });
});
