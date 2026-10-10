import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const SCRYPT_V1_PATTERN = /^scrypt\$v1\$32768\$8\$1\$([0-9a-f]{32})\$([0-9a-f]{128})$/;
const LEGACY_PATTERN = /^([0-9a-f]{32}):([0-9a-f]{64})$/;
const INVALID_RESULT = Object.freeze({ valid: false, needsRehash: false });

function equalHex(leftHex, rightHex) {
  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');

  return left.length === right.length && timingSafeEqual(left, right);
}

async function deriveScrypt(password, saltHex) {
  return scrypt(password, Buffer.from(saltHex, 'hex'), KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
}

export async function hashPassword(password) {
  const saltHex = randomBytes(SALT_BYTES).toString('hex');
  const derived = await deriveScrypt(password, saltHex);

  return `scrypt$v1$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${saltHex}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return INVALID_RESULT;

  if (stored.startsWith('scrypt$')) {
    const match = SCRYPT_V1_PATTERN.exec(stored);
    if (!match) return INVALID_RESULT;

    const [, saltHex, expectedHex] = match;
    const actual = await deriveScrypt(password, saltHex);
    return { valid: equalHex(actual.toString('hex'), expectedHex), needsRehash: false };
  }

  const legacyMatch = LEGACY_PATTERN.exec(stored);
  if (!legacyMatch) return INVALID_RESULT;

  const [, salt, expectedHex] = legacyMatch;
  const actualHex = createHash('sha256').update(`${salt}:${password}`).digest('hex');
  const valid = equalHex(actualHex, expectedHex);

  return { valid, needsRehash: valid };
}
