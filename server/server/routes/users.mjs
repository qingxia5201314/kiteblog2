import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestIp } from '../requestIp.mjs';
import { emitSecurityEvent } from '../securityLog.mjs';
import { clearSessionCookie, writeSessionCookie } from '../sessionCookie.mjs';

const CREDENTIALS_MESSAGE = '用户名或密码错误';
const RATE_LIMIT_MESSAGE = '登录尝试过于频繁，请稍后再试';
const REGISTRATION_RATE_LIMIT_MESSAGE = '注册尝试过于频繁，请稍后再试';
const REGISTRATION_VALIDATION_MESSAGE = '注册信息格式错误';
const JSON_BODY_LIMIT_BYTES = 16 * 1024;
const REGISTRATION_IDENTITY = '<registration>';
const REGISTRATION_BUSINESS_ERRORS = new Set([
  '用户名需为 3-24 位字母、数字或下划线',
  '密码至少 6 位',
  '用户名已存在',
]);

const app = new Hono();

function normalizedUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isJsonObject(body) {
  return body !== null && typeof body === 'object' && !Array.isArray(body);
}

function hasCredentialTypes(body, { nickname = false } = {}) {
  return (
    typeof body.username === 'string' &&
    typeof body.password === 'string' &&
    (!nickname || body.nickname === undefined || typeof body.nickname === 'string')
  );
}

function hasOverlongCredentials(body, { nickname = false } = {}) {
  return (
    body.username.length > 24 ||
    body.password.length > 256 ||
    (nickname && typeof body.nickname === 'string' && body.nickname.length > 80)
  );
}

async function revokeSessionBestEffort(c, token) {
  if (!token) return;
  try {
    await c.get('userStore').revokeSession(token);
  } catch {
    // Preserve the original authentication failure.
  }
}

app.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'private, no-store');
});

const jsonBodyLimit = bodyLimit({
  maxSize: JSON_BODY_LIMIT_BYTES,
  onError: (c) => c.json({ ok: false, message: '请求体过大' }, 413),
});
app.use('/register', jsonBodyLimit);
app.use('/login', jsonBodyLimit);

app.post('/register', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, message: '请求格式错误' }, 400);
  }

  const ip = requestIp(c);
  const limiter = c.get('loginRateLimiter');
  const reservation = limiter.reserve(ip, REGISTRATION_IDENTITY);
  if (!reservation.allowed) {
    c.header('Retry-After', String(reservation.retryAfterSeconds));
    emitSecurityEvent(c.get('securityLog'), {
      type: 'registration_rate_limited',
      result: 'blocked',
      username: REGISTRATION_IDENTITY,
      ip,
    });
    return c.json({ ok: false, message: REGISTRATION_RATE_LIMIT_MESSAGE }, 429);
  }

  const username = typeof body?.username === 'string' ? normalizedUsername(body.username) : '';
  if (
    !isJsonObject(body) ||
    !hasCredentialTypes(body, { nickname: true }) ||
    hasOverlongCredentials(body, { nickname: true })
  ) {
    return c.json({ ok: false, message: REGISTRATION_VALIDATION_MESSAGE }, 400);
  }

  let token = '';
  try {
    const registration = await c.get('userStore').register(body);
    ({ token } = registration);
    const { user, expiresAt } = registration;
    writeSessionCookie(c, token);
    const response = c.json({ ok: true, user, expiresAt }, 201);
    emitSecurityEvent(c.get('securityLog'), {
      type: 'registration_success',
      result: 'success',
      userId: user.id,
      username,
      ip,
    });
    return response;
  } catch (error) {
    await revokeSessionBestEffort(c, token);
    if (REGISTRATION_BUSINESS_ERRORS.has(error?.message)) {
      return c.json({ ok: false, message: error.message }, 400);
    }

    emitSecurityEvent(c.get('securityLog'), { type: 'registration_error', result: 'error', username, ip });
    return c.json({ ok: false, message: '注册失败' }, 500);
  }
});

app.post('/login', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, message: '请求格式错误' }, 400);
  }

  if (!isJsonObject(body)) {
    return c.json({ ok: false, message: '请求格式错误' }, 400);
  }

  const username = typeof body.username === 'string' ? normalizedUsername(body.username) : '';
  const ip = requestIp(c);
  const limiter = c.get('loginRateLimiter');
  const reservation = limiter.reserve(ip, username);
  if (!reservation.allowed) {
    c.header('Retry-After', String(reservation.retryAfterSeconds));
    emitSecurityEvent(c.get('securityLog'), { type: 'login_rate_limited', result: 'blocked', username, ip });
    return c.json({ ok: false, message: RATE_LIMIT_MESSAGE }, 429);
  }

  if (!hasCredentialTypes(body) || hasOverlongCredentials(body)) {
    emitSecurityEvent(c.get('securityLog'), { type: 'login_failure', result: 'failure', username, ip });
    return c.json({ ok: false, message: CREDENTIALS_MESSAGE }, 401);
  }

  let token = '';
  try {
    const login = await c.get('userStore').login(body);
    ({ token } = login);
    const { user, expiresAt } = login;
    writeSessionCookie(c, token);
    const response = c.json({ ok: true, user, expiresAt });
    emitSecurityEvent(c.get('securityLog'), {
      type: 'login_success',
      result: 'success',
      userId: user.id,
      username,
      ip,
    });
    limiter.clear(ip, username);
    return response;
  } catch (error) {
    await revokeSessionBestEffort(c, token);
    if (error?.message === CREDENTIALS_MESSAGE) {
      emitSecurityEvent(c.get('securityLog'), { type: 'login_failure', result: 'failure', username, ip });
      return c.json({ ok: false, message: CREDENTIALS_MESSAGE }, 401);
    }

    emitSecurityEvent(c.get('securityLog'), { type: 'login_error', result: 'error', username, ip });
    return c.json({ ok: false, message: '登录失败' }, 500);
  }
});

app.get('/me', (c) => {
  const session = c.get('authSession');
  if (!session) return c.json({ ok: false, message: 'Unauthorized' }, 401);
  return c.json({ ok: true, user: session.user, expiresAt: session.expiresAt });
});

app.post('/logout', async (c) => {
  const rawToken = c.get('authToken') || '';
  const session = c.get('authSession');
  let revokeFailed = false;

  try {
    if (rawToken) await c.get('userStore').revokeSession(rawToken);
  } catch {
    revokeFailed = true;
  } finally {
    try {
      clearSessionCookie(c);
    } finally {
      emitSecurityEvent(c.get('securityLog'), {
        type: 'logout',
        result: revokeFailed
          ? 'logout_error'
          : session?.user
            ? 'success'
            : rawToken
              ? 'invalid_session'
              : 'anonymous',
        ...(session?.user ? { userId: session.user.id } : {}),
        username: normalizedUsername(session?.user?.username),
        ip: requestIp(c),
      });
    }
  }

  if (revokeFailed) {
    return c.json({ ok: false, message: '退出登录失败' }, 500);
  }
  return c.json({ ok: true });
});

export const usersRoutes = app;
