function identityKey(ip, username) {
  return JSON.stringify([String(ip), String(username).trim().toLowerCase()]);
}

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite integer`);
  }
}

function currentEntry(entries, key, currentTime, windowMs) {
  const entry = entries.get(key);
  if (entry && currentTime - entry.startedAt >= windowMs) {
    entries.delete(key);
    return undefined;
  }
  return entry;
}

function reserveEntry(entries, key, entry, currentTime, maxEntries) {
  if (entry) {
    entry.count += 1;
    return;
  }

  if (entries.size >= maxEntries) {
    entries.delete(entries.keys().next().value);
  }
  entries.set(key, { count: 1, startedAt: currentTime });
}

function remainingWindowMs(entry, currentTime, windowMs) {
  return windowMs - (currentTime - entry.startedAt);
}

export function createLoginRateLimiter({
  now = Date.now,
  windowMs = 900_000,
  maxFailures = 5,
  maxIpAttempts = 25,
  maxEntries = 10_000
} = {}) {
  assertPositiveInteger('windowMs', windowMs);
  assertPositiveInteger('maxFailures', maxFailures);
  assertPositiveInteger('maxIpAttempts', maxIpAttempts);
  assertPositiveInteger('maxEntries', maxEntries);

  const pairAttempts = new Map();
  const ipAttempts = new Map();

  function reserve(ip, username) {
    const currentTime = now();
    const ipKey = String(ip);
    const pairKey = identityKey(ip, username);
    const pairEntry = currentEntry(pairAttempts, pairKey, currentTime, windowMs);
    const ipEntry = currentEntry(ipAttempts, ipKey, currentTime, windowMs);
    const pairBlocked = pairEntry?.count >= maxFailures;
    const ipBlocked = ipEntry?.count >= maxIpAttempts;

    if (pairBlocked || ipBlocked) {
      const pairRemaining = pairBlocked ? remainingWindowMs(pairEntry, currentTime, windowMs) : 0;
      const ipRemaining = ipBlocked ? remainingWindowMs(ipEntry, currentTime, windowMs) : 0;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(Math.max(pairRemaining, ipRemaining) / 1_000))
      };
    }

    reserveEntry(pairAttempts, pairKey, pairEntry, currentTime, maxEntries);
    reserveEntry(ipAttempts, ipKey, ipEntry, currentTime, maxEntries);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  function clear(ip, username) {
    pairAttempts.delete(identityKey(ip, username));
    ipAttempts.delete(String(ip));
  }

  return { reserve, clear };
}
