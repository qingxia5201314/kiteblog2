# Unified Administrator Authentication Deployment

This runbook deploys the Cookie-session migration as one frontend/backend release and keeps the pre-migration application and database as a paired rollback unit. Complete the local test, build, residue, and three-role smoke gates first.

No VPS deployment was performed while preparing this runbook.

## 1. Set and Verify Host Variables

Existing project deployment notes name `kitepop-blog.service`, `/opt/kitepop-blog`, and `/var/www/myblog`. The repository does not contain the installed systemd unit, its environment-file path, the active Nginx site path, or the backup root. Replace every angle-bracket value below from the actual host before running anything; the guards deliberately reject unchanged placeholders.

```bash
set -euo pipefail
umask 077

SERVICE='kitepop-blog.service'
APP_DIR='/opt/kitepop-blog'
STATIC_ROOT='/var/www/myblog'
SERVICE_ENV_FILE='<replace-with-active-systemd-EnvironmentFile>'
NGINX_SITE='<replace-with-active-nginx-site-path>'
BACKUP_ROOT='<replace-with-private-backup-root>'
RELEASE_SHA='<replace-with-reviewed-git-commit>'

case "$SERVICE_ENV_FILE$NGINX_SITE$BACKUP_ROOT$RELEASE_SHA" in
  *'<'*|'') echo 'Replace every placeholder before continuing' >&2; exit 1 ;;
esac

sudo systemctl status "$SERVICE" --no-pager
sudo systemctl cat "$SERVICE" | grep -F -- "$SERVICE_ENV_FILE" >/dev/null
if sudo systemctl cat "$SERVICE" | grep -Eq '^[[:space:]]*Environment=.*(ADMIN_PASSWORD|NODE_ENV|SITE_URL|TRUST_PROXY)='; then
  echo 'The unit has inline authentication environment values; reconcile them before stopping the service' >&2
  exit 1
fi
test -d "$APP_DIR/.git"
test -f "$APP_DIR/deploy/nginx-kitepop.conf"
sudo test -f "$SERVICE_ENV_FILE"
sudo test -f "$NGINX_SITE"
sudo install -d -m 0700 "$BACKUP_ROOT"
```

Do not substitute a guessed service or environment file. If the unit does not reference `SERVICE_ENV_FILE`, stop and resolve the active configuration with `systemctl cat kitepop-blog.service` before continuing. Do not paste the unit/environment output into tickets or logs because it may contain secrets.

## 2. Stop the Service and Resolve the Real Database

Stop the service before the read-only precondition and all backups. Resolve a relative `POST_DB_PATH` against the systemd working directory, not the operator's shell directory.

```bash
sudo systemctl stop "$SERVICE"
test "$(sudo systemctl is-active "$SERVICE")" = inactive

WORK_DIR="$(sudo systemctl show "$SERVICE" -p WorkingDirectory --value)"
test -n "$WORK_DIR"
if sudo systemctl cat "$SERVICE" | grep -Eq '^[[:space:]]*Environment=.*POST_DB_PATH='; then
  echo 'POST_DB_PATH is defined inline in the unit; resolve that override before using the EnvironmentFile parser' >&2
  exit 1
fi

POST_DB_CONFIGURED="$({
  sudo sed -n 's/^[[:space:]]*POST_DB_PATH[[:space:]]*=[[:space:]]*//p' "$SERVICE_ENV_FILE"
} | tail -n 1)"
POST_DB_CONFIGURED="${POST_DB_CONFIGURED%\"}"
POST_DB_CONFIGURED="${POST_DB_CONFIGURED#\"}"
POST_DB_CONFIGURED="${POST_DB_CONFIGURED%\'}"
POST_DB_CONFIGURED="${POST_DB_CONFIGURED#\'}"
test -n "$POST_DB_CONFIGURED"

case "$POST_DB_CONFIGURED" in
  /*) POST_DB_PATH="$(realpath "$POST_DB_CONFIGURED")" ;;
  *)  POST_DB_PATH="$(realpath "$WORK_DIR/$POST_DB_CONFIGURED")" ;;
esac
test -f "$POST_DB_PATH"
echo "Resolved POST_DB_PATH to an existing file; value intentionally not logged."
```

If `POST_DB_PATH` is defined inline in the unit or expanded from another variable, the parser above must fail rather than silently using `./data/blog.sqlite`. Resolve that case from the actual unit configuration and set `POST_DB_PATH` to the exact existing file before proceeding.

## 3. Read-Only Administrator Precondition

Run the exact query against the resolved database with the project's installed `sql.js`. The script opens the file into memory and never exports or persists it. It prints the selected administrator identity but no password, hash, Cookie, or token, and exits nonzero unless exactly one row exists.

```bash
cd "$APP_DIR"
POST_DB_PATH="$POST_DB_PATH" node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises';
import initSqlJs from 'sql.js';

const SQL = await initSqlJs();
const database = new SQL.Database(await readFile(process.env.POST_DB_PATH));
try {
  const result = database.exec(
    "SELECT id,username,nickname FROM users WHERE permission='admin';",
  );
  const columns = result[0]?.columns ?? [];
  const rows = (result[0]?.values ?? []).map((values) =>
    Object.fromEntries(columns.map((column, index) => [column, values[index]])),
  );
  if (rows.length !== 1) {
    console.error(`ABORT: expected exactly one administrator, found ${rows.length}`);
    process.exitCode = 2;
  } else {
    console.log(JSON.stringify(rows[0]));
  }
} finally {
  database.close();
}
NODE
```

Do not continue on zero or multiple rows. The existing administrator is whichever single row the database returns; no username is hard-coded into code, configuration, or deployment commands.

## 4. Create the Paired Backup Before Migration

Do not start the new release, run a migration helper, or otherwise open the database through new application code before this section is complete. The stopped service guarantees a consistent SQLite snapshot.

```bash
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PAIR_DIR="$BACKUP_ROOT/admin-auth-$STAMP"
sudo install -d -m 0700 "$PAIR_DIR"

sudo tar \
  --exclude='./.git' \
  --exclude='./node_modules' \
  --exclude='./data' \
  -C "$APP_DIR" \
  -czf "$PAIR_DIR/application.tar.gz" .
sudo cp --preserve=all "$POST_DB_PATH" "$PAIR_DIR/database.sqlite"
sudo cp --preserve=all "$SERVICE_ENV_FILE" "$PAIR_DIR/service.env"
sudo cp --preserve=all "$NGINX_SITE" "$PAIR_DIR/nginx-site.conf"
git -C "$APP_DIR" rev-parse HEAD | sudo tee "$PAIR_DIR/application.gitsha" >/dev/null

sudo env \
  SERVICE="$SERVICE" \
  APP_DIR="$APP_DIR" \
  STATIC_ROOT="$STATIC_ROOT" \
  SERVICE_ENV_FILE="$SERVICE_ENV_FILE" \
  NGINX_SITE="$NGINX_SITE" \
  POST_DB_PATH="$POST_DB_PATH" \
  bash -c 'printf "%q=%q\n" SERVICE "$SERVICE" APP_DIR "$APP_DIR" STATIC_ROOT "$STATIC_ROOT" SERVICE_ENV_FILE "$SERVICE_ENV_FILE" NGINX_SITE "$NGINX_SITE" POST_DB_PATH "$POST_DB_PATH"' \
  | sudo tee "$PAIR_DIR/PAIR.env" >/dev/null

sudo bash -c "cd '$PAIR_DIR' && sha256sum application.tar.gz database.sqlite service.env nginx-site.conf application.gitsha PAIR.env > SHA256SUMS"
sudo bash -c "cd '$PAIR_DIR' && sha256sum -c SHA256SUMS"
```

Keep `PAIR_DIR` and `SHA256SUMS` together. `application.tar.gz` and `database.sqlite` are one rollback pair; never restore only one of them across this authentication migration.

## 5. Deploy Matching Frontend and Backend

The same `RELEASE_SHA` supplies the Node server and the Vite frontend. The status guard stops deployment if the live checkout has uncommitted changes; the backup remains available for inspection and rollback.

```bash
cd "$APP_DIR"
test -z "$(git status --porcelain)"
git fetch --all --tags --prune
git cat-file -e "$RELEASE_SHA^{commit}"
git switch --detach "$RELEASE_SHA"
test "$(git rev-parse HEAD)" = "$(git rev-parse "$RELEASE_SHA^{commit}")"

npm ci
npm test -- --run
npm run build

sudo sed -i -E \
  -e '/^[[:space:]]*ADMIN_PASSWORD[[:space:]]*=/d' \
  -e '/^[[:space:]]*NODE_ENV[[:space:]]*=/d' \
  -e '/^[[:space:]]*SITE_URL[[:space:]]*=/d' \
  -e '/^[[:space:]]*TRUST_PROXY[[:space:]]*=/d' \
  "$SERVICE_ENV_FILE"
printf '%s\n' \
  'NODE_ENV=production' \
  'SITE_URL=https://kitepop.top' \
  'TRUST_PROXY=1' \
  | sudo tee -a "$SERVICE_ENV_FILE" >/dev/null

sudo grep -Fx 'NODE_ENV=production' "$SERVICE_ENV_FILE" >/dev/null
sudo grep -Fx 'SITE_URL=https://kitepop.top' "$SERVICE_ENV_FILE" >/dev/null
sudo grep -Fx 'TRUST_PROXY=1' "$SERVICE_ENV_FILE" >/dev/null
if sudo grep -Eq '^[[:space:]]*ADMIN_PASSWORD[[:space:]]*=' "$SERVICE_ENV_FILE"; then
  echo 'ADMIN_PASSWORD is still configured' >&2
  exit 1
fi
sudo install -d -m 0755 "$STATIC_ROOT"
sudo rsync -a --delete "$APP_DIR/dist/" "$STATIC_ROOT/"
sudo install -m 0644 "$APP_DIR/deploy/nginx-kitepop.conf" "$NGINX_SITE"
sudo nginx -t
sudo systemctl reload nginx
WWW_PROBE_PATH='/api/users/me?canonical-probe=1'
WWW_REDIRECT="$(curl --silent --show-error --output /dev/null --write-out '%{http_code} %{redirect_url}' \
  "https://www.kitepop.top$WWW_PROBE_PATH")"
test "$WWW_REDIRECT" = "301 https://kitepop.top$WWW_PROBE_PATH"
sudo systemctl daemon-reload
LOG_SINCE="$(date --iso-8601=seconds)"
sudo systemctl restart "$SERVICE"
sudo systemctl is-active --quiet "$SERVICE"
sudo journalctl -u "$SERVICE" --since "$LOG_SINCE" --no-pager -n 200
```

Review the startup log for the listening message and migration errors. Do not copy authentication request bodies, Cookie headers, password input, or raw session values into the journal or deployment record.

## 6. Production Authentication Checks

Use existing reader and administrator accounts. The following script accepts passwords through hidden shell input, keeps Cookies only in process memory, and prints labels plus status codes/flag results. Disable shell tracing and do not redirect its input or output to a credential-bearing log.

```bash
set +x
read -r -p 'Reader username: ' READER_USERNAME
read -r -s -p 'Reader password: ' READER_PASSWORD; printf '\n'
read -r -p 'Administrator username: ' ADMIN_USERNAME
read -r -s -p 'Administrator password: ' ADMIN_PASSWORD_INPUT; printf '\n'
export READER_USERNAME READER_PASSWORD ADMIN_USERNAME ADMIN_PASSWORD_INPUT
trap 'unset READER_USERNAME READER_PASSWORD ADMIN_USERNAME ADMIN_PASSWORD_INPUT' EXIT

node --input-type=module <<'NODE'
import assert from 'node:assert/strict';

const origin = 'https://kitepop.top';
const crossOrigin = 'https://cross-site.invalid';

function containsTokenKey(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) =>
    /token/i.test(key) || containsTokenKey(child),
  );
}

function status(label, actual, expected) {
  console.log(`${label}: ${actual}`);
  assert.equal(actual, expected);
}

async function login(label, username, password, permission) {
  const response = await fetch(`${origin}/api/users/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  status(`${label} login`, response.status, 200);
  const payload = await response.json();
  assert.equal(containsTokenKey(payload), false, `${label} login returned a token field`);
  assert.equal(payload.user?.permission, permission, `${label} permission mismatch`);
  const setCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie');
  assert.ok(setCookie, `${label} login did not set a Cookie`);
  return { payload, setCookie, cookie: setCookie.split(';', 1)[0] };
}

const anonymous = await fetch(`${origin}/api/admin/about`);
status('anonymous GET /api/admin/about', anonymous.status, 401);

const reader = await login('reader', process.env.READER_USERNAME, process.env.READER_PASSWORD, 'reader');
const readerAbout = await fetch(`${origin}/api/admin/about`, { headers: { Cookie: reader.cookie } });
status('reader GET /api/admin/about', readerAbout.status, 403);
const readerLogout = await fetch(`${origin}/api/users/logout`, {
  method: 'POST',
  headers: { Cookie: reader.cookie, Origin: origin },
});
status('reader logout', readerLogout.status, 200);

const admin = await login('admin', process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD_INPUT, 'admin');
const attributes = admin.setCookie.split(';').map((part) => part.trim());
assert.equal(attributes[0].split('=', 1)[0], '__Host-kitepop_session');
assert.ok(attributes.some((part) => part.toLowerCase() === 'secure'));
assert.ok(attributes.some((part) => part.toLowerCase() === 'httponly'));
assert.ok(attributes.some((part) => part.toLowerCase() === 'samesite=lax'));
assert.ok(attributes.some((part) => part.toLowerCase() === 'path=/'));
assert.ok(attributes.some((part) => part.toLowerCase() === 'max-age=2592000'));
assert.ok(!attributes.some((part) => part.toLowerCase().startsWith('domain=')));
console.log('admin login Cookie flags: OK');

const adminAbout = await fetch(`${origin}/api/admin/about`, { headers: { Cookie: admin.cookie } });
status('admin GET /api/admin/about', adminAbout.status, 200);
const adminUpdatePath = `/api/admin/users/${encodeURIComponent(admin.payload.user.id)}`;
const adminUpdateBody = {
  nickname: admin.payload.user.nickname,
  permission: admin.payload.user.permission,
};

const crossSitePut = await fetch(`${origin}${adminUpdatePath}`, {
  method: 'PUT',
  headers: { Cookie: admin.cookie, Origin: crossOrigin, 'Content-Type': 'application/json' },
  body: JSON.stringify(adminUpdateBody),
});
status('cross-site admin PUT', crossSitePut.status, 403);

const sameSitePut = await fetch(`${origin}${adminUpdatePath}`, {
  method: 'PUT',
  headers: { Cookie: admin.cookie, Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify(adminUpdateBody),
});
status('same-site admin PUT', sameSitePut.status, 200);

const noCookieMe = await fetch(`${origin}/api/users/me`);
status('GET /api/users/me without Cookie', noCookieMe.status, 401);

const oldBearer = await fetch(`${origin}/api/admin/about`, {
  headers: { Authorization: 'Bearer retired-session-probe' },
});
status('old Bearer only', oldBearer.status, 401);

for (const path of ['/api/admin/login', '/api/accounting/login']) {
  const retired = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'retired-shared-password-probe' }),
  });
  status(`retired ${path}`, retired.status, 404);
}

const logout = await fetch(`${origin}/api/users/logout`, {
  method: 'POST',
  headers: { Cookie: admin.cookie, Origin: origin },
});
status('admin logout', logout.status, 200);
const replay = await fetch(`${origin}/api/admin/about`, { headers: { Cookie: admin.cookie } });
status('logout then replay Cookie', replay.status, 401);
NODE

unset READER_USERNAME READER_PASSWORD ADMIN_USERNAME ADMIN_PASSWORD_INPUT
trap - EXIT
```

Also use a private browser session to confirm anonymous reading still works and the administrator can load backend editing, accounting, images, files, About, drafts, revisions, scheduling, and user management. Confirm a reader sees the permission-denied state. Inspect only the Cookie name and attributes, never its value. Review security logs for event types and status without recording passwords, raw Cookies, session tokens, or password hashes.

## 7. Paired Rollback

Rollback must restore the application release and its paired pre-migration database. Do not run the old application against the migrated database and do not keep the new application with the old database.

```bash
set -euo pipefail
umask 077
PAIR_DIR='<replace-with-the-exact-admin-auth-backup-directory>'
case "$PAIR_DIR" in *'<'*|'') echo 'Set PAIR_DIR' >&2; exit 1 ;; esac

sudo bash -c "cd '$PAIR_DIR' && sha256sum -c SHA256SUMS"
# PAIR.env was created by this runbook and is trusted only after SHA-256 verification.
eval "$(sudo cat "$PAIR_DIR/PAIR.env")"

sudo systemctl stop "$SERVICE"
test "$(sudo systemctl is-active "$SERVICE")" = inactive

RESTORE_DIR="$(mktemp -d)"
trap 'sudo rm -rf "$RESTORE_DIR"' EXIT
sudo tar -xzf "$PAIR_DIR/application.tar.gz" -C "$RESTORE_DIR"
PREVIOUS_RELEASE_SHA="$(sudo cat "$PAIR_DIR/application.gitsha")"
git -C "$APP_DIR" cat-file -e "$PREVIOUS_RELEASE_SHA^{commit}"
git -C "$APP_DIR" switch --detach "$PREVIOUS_RELEASE_SHA"
sudo rsync -a --delete \
  --exclude='.git/' \
  --exclude='data/' \
  --exclude='node_modules/' \
  "$RESTORE_DIR/" "$APP_DIR/"
sudo cp --preserve=all "$PAIR_DIR/service.env" "$SERVICE_ENV_FILE"
sudo cp --preserve=all "$PAIR_DIR/nginx-site.conf" "$NGINX_SITE"
sudo cp --preserve=all "$PAIR_DIR/database.sqlite" "$POST_DB_PATH"

EXPECTED_DB_SHA="$(sudo sha256sum "$PAIR_DIR/database.sqlite" | awk '{print $1}')"
RESTORED_DB_SHA="$(sudo sha256sum "$POST_DB_PATH" | awk '{print $1}')"
test "$RESTORED_DB_SHA" = "$EXPECTED_DB_SHA"
sudo cmp -s "$PAIR_DIR/service.env" "$SERVICE_ENV_FILE"
sudo cmp -s "$PAIR_DIR/nginx-site.conf" "$NGINX_SITE"
test -z "$(sudo rsync -a --delete --checksum --dry-run \
  --exclude='.git/' --exclude='data/' --exclude='node_modules/' \
  "$RESTORE_DIR/" "$APP_DIR/")"

cd "$APP_DIR"
npm ci
sudo rsync -a --delete "$APP_DIR/dist/" "$STATIC_ROOT/"
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl daemon-reload
sudo systemctl restart "$SERVICE"
sudo systemctl is-active --quiet "$SERVICE"
sudo journalctl -u "$SERVICE" --since '-5 minutes' --no-pager -n 200
```

After restart, repeat the health and authentication checks appropriate to the restored release. Preserve the paired backup and its hash manifest until the migration has completed its retention period.
