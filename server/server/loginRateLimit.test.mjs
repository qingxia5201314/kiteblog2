import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLoginRateLimiter } from './loginRateLimit.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLoginRateLimiter', () => {
  it('atomically reserves only the configured number of concurrent attempts', async () => {
    const limiter = createLoginRateLimiter({ now: () => 1_000, maxFailures: 1 });

    const results = await Promise.all(
      Array.from({ length: 3 }, async () => limiter.reserve('203.0.113.10', 'admin'))
    );

    expect(results).toEqual([
      { allowed: true, retryAfterSeconds: 0 },
      { allowed: false, retryAfterSeconds: 900 },
      { allowed: false, retryAfterSeconds: 900 }
    ]);
  });

  it('blocks username spraying when the per-IP budget is exhausted', () => {
    const limiter = createLoginRateLimiter({
      now: () => 2_000,
      maxFailures: 5,
      maxIpAttempts: 3
    });

    expect(limiter.reserve('198.51.100.2', 'first')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.reserve('198.51.100.2', 'second')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.reserve('198.51.100.2', 'third')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.reserve('198.51.100.2', 'fourth')).toEqual({
      allowed: false,
      retryAfterSeconds: 900
    });
  });

  it('uses a default per-IP budget of 25 attempts', () => {
    const limiter = createLoginRateLimiter({ now: () => 3_000 });

    for (let attempt = 0; attempt < 25; attempt += 1) {
      expect(limiter.reserve('192.0.2.25', `user-${attempt}`).allowed).toBe(true);
    }

    expect(limiter.reserve('192.0.2.25', 'user-25')).toEqual({
      allowed: false,
      retryAfterSeconds: 900
    });
  });

  it('does not consume either budget when the pair or IP is already blocked', () => {
    let currentTime = 0;
    const limiter = createLoginRateLimiter({
      now: () => currentTime,
      windowMs: 1_000,
      maxFailures: 1,
      maxIpAttempts: 2
    });

    expect(limiter.reserve('192.0.2.7', 'blocked-pair').allowed).toBe(true);
    currentTime = 500;
    expect(limiter.reserve('192.0.2.7', 'blocked-pair').allowed).toBe(false);
    expect(limiter.reserve('192.0.2.7', 'other-user').allowed).toBe(true);
    expect(limiter.reserve('192.0.2.7', 'third-user')).toEqual({
      allowed: false,
      retryAfterSeconds: 1
    });
  });

  it('reports the later retry window when both budgets are blocked', () => {
    let currentTime = 0;
    const limiter = createLoginRateLimiter({
      now: () => currentTime,
      windowMs: 2_500,
      maxFailures: 1,
      maxIpAttempts: 2
    });

    expect(limiter.reserve('192.0.2.8', 'first-user').allowed).toBe(true);
    currentTime = 1_000;
    expect(limiter.reserve('192.0.2.8', 'second-user').allowed).toBe(true);
    currentTime = 1_001;

    expect(limiter.reserve('192.0.2.8', 'second-user')).toEqual({
      allowed: false,
      retryAfterSeconds: 3
    });
  });

  it('anchors each fixed window at its first reservation and rounds retry time up', () => {
    let currentTime = 10_000;
    const limiter = createLoginRateLimiter({
      now: () => currentTime,
      windowMs: 2_500,
      maxFailures: 2,
      maxIpAttempts: 10
    });

    expect(limiter.reserve('198.51.100.4', 'admin').allowed).toBe(true);
    currentTime = 10_600;
    expect(limiter.reserve('198.51.100.4', 'admin').allowed).toBe(true);

    currentTime = 11_001;
    expect(limiter.reserve('198.51.100.4', 'admin')).toEqual({
      allowed: false,
      retryAfterSeconds: 2
    });

    currentTime = 12_499;
    expect(limiter.reserve('198.51.100.4', 'admin')).toEqual({
      allowed: false,
      retryAfterSeconds: 1
    });
  });

  it('starts fresh windows at the exact expiry boundary', () => {
    let currentTime = 0;
    const limiter = createLoginRateLimiter({
      now: () => currentTime,
      windowMs: 1_000,
      maxFailures: 1,
      maxIpAttempts: 1
    });

    expect(limiter.reserve('192.0.2.1', 'reader').allowed).toBe(true);
    currentTime = 1_000;
    expect(limiter.reserve('192.0.2.1', 'reader')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.reserve('192.0.2.1', 'reader')).toEqual({
      allowed: false,
      retryAfterSeconds: 1
    });
  });

  it('normalizes usernames but preserves the trusted IP string exactly', () => {
    const limiter = createLoginRateLimiter({ now: () => 5_000, maxFailures: 1 });

    expect(limiter.reserve(' 203.0.113.7 ', '  AdMiN  ').allowed).toBe(true);

    expect(limiter.reserve(' 203.0.113.7 ', 'admin')).toEqual({
      allowed: false,
      retryAfterSeconds: 900
    });
    expect(limiter.reserve('203.0.113.7', 'admin')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('isolates IP and username tuples without concatenation collisions', () => {
    const limiter = createLoginRateLimiter({ now: () => 7_000, maxFailures: 1 });

    expect(limiter.reserve('ab', 'c').allowed).toBe(true);
    expect(limiter.reserve('a', 'bc')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.reserve('other-ip', 'c')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('clear removes the normalized pair and its IP budget', () => {
    const limiter = createLoginRateLimiter({
      now: () => 9_000,
      maxFailures: 1,
      maxIpAttempts: 2
    });

    expect(limiter.reserve('203.0.113.1', 'Admin').allowed).toBe(true);
    expect(limiter.reserve('203.0.113.1', 'reader').allowed).toBe(true);
    limiter.clear('203.0.113.1', ' ADMIN ');

    expect(limiter.reserve('203.0.113.1', 'admin')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.reserve('203.0.113.1', 'third-user')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.reserve('203.0.113.1', 'reader')).toEqual({
      allowed: false,
      retryAfterSeconds: 900
    });
  });

  it('bounds pair and IP state and evicts each oldest insertion', () => {
    const pairLimiter = createLoginRateLimiter({
      now: () => 10_000,
      maxFailures: 1,
      maxIpAttempts: 10,
      maxEntries: 2
    });

    expect(pairLimiter.reserve('same-ip', 'oldest').allowed).toBe(true);
    expect(pairLimiter.reserve('same-ip', 'newer').allowed).toBe(true);
    expect(pairLimiter.reserve('same-ip', 'newest').allowed).toBe(true);
    expect(pairLimiter.reserve('same-ip', 'oldest')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(pairLimiter.reserve('same-ip', 'newest')).toEqual({
      allowed: false,
      retryAfterSeconds: 900
    });

    const ipLimiter = createLoginRateLimiter({
      now: () => 10_000,
      maxFailures: 10,
      maxIpAttempts: 1,
      maxEntries: 2
    });

    expect(ipLimiter.reserve('oldest-ip', 'user').allowed).toBe(true);
    expect(ipLimiter.reserve('newer-ip', 'user').allowed).toBe(true);
    expect(ipLimiter.reserve('newest-ip', 'user').allowed).toBe(true);
    expect(ipLimiter.reserve('oldest-ip', 'another-user')).toEqual({
      allowed: true,
      retryAfterSeconds: 0
    });
    expect(ipLimiter.reserve('newest-ip', 'another-user')).toEqual({
      allowed: false,
      retryAfterSeconds: 900
    });
  });

  it('does not implement whole-map request-time scans', () => {
    const source = readFileSync('server/loginRateLimit.mjs', 'utf8');

    expect(source).not.toMatch(/\bfor\s*(?:await\s*)?\(|\.forEach\s*\(/u);
  });

  it.each([
    ['windowMs', 0],
    ['windowMs', 1.5],
    ['maxFailures', Number.POSITIVE_INFINITY],
    ['maxFailures', -1],
    ['maxIpAttempts', Number.NaN],
    ['maxIpAttempts', 2.2],
    ['maxEntries', 0],
    ['maxEntries', '10']
  ])('rejects an invalid %s option', (option, value) => {
    expect(() => createLoginRateLimiter({ [option]: value })).toThrow(TypeError);
  });

  it('uses Date.now by default', () => {
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(20_000);
    const limiter = createLoginRateLimiter({ windowMs: 1_500, maxFailures: 1 });

    expect(limiter.reserve('127.0.0.1', 'admin').allowed).toBe(true);
    dateNow.mockReturnValue(20_001);
    expect(limiter.reserve('127.0.0.1', 'admin')).toEqual({
      allowed: false,
      retryAfterSeconds: 2
    });
  });

  it('exposes only reserve and clear to prevent split check-and-record usage', () => {
    const limiter = createLoginRateLimiter();

    expect(Object.keys(limiter).sort()).toEqual(['clear', 'reserve']);
    expect(limiter.check).toBeUndefined();
    expect(limiter.recordFailure).toBeUndefined();
  });
});
