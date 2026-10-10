'use strict';
// Restore every local modification to node_modules/hexo-admin after `npm install`.
//
// hexo-admin is consumed as a prebuilt npm package: it ships a webpack bundle
// whose sources are not part of this repo, and this project needs behaviour the
// upstream release does not have. Historically those edits were applied to
// node_modules by hand (see operations/patch-publish-ux.py and
// operations/patch-async-publish.py) and were silently lost the next time
// dependencies were reinstalled, which left the backend answering
// `{job, post}` to a frontend that did not understand it.
//
// This script is the single entry point that puts all of it back. It runs from
// the `postinstall` hook, so `npm install` is always self-healing.
//
// Invariant: operations/hexo-admin-api.js and operations/hexo-admin-bundle.js
// must stay in sync -- the bundle polls the publish-status endpoint that the api
// exposes. Changing publish behaviour means editing the pair, then copying the
// rebuilt bundle back over operations/hexo-admin-bundle.js.
const fs = require('node:fs');

const ADMIN = 'node_modules/hexo-admin';

function mirror(from, to, what) {
  fs.copyFileSync(from, to);
  console.log(`patch-admin: restored ${what} (${to})`);
}

// 1. deploy.js -- report a non-zero exit code as an error instead of
//    reporting success for a failed deploy. Anchored on the upstream text, so
//    re-running against an already-patched copy is a no-op rather than a
//    duplicated edit.
const deployPath = `${ADMIN}/deploy.js`;
const upstreamClose =
  "proc.on('close', function () {\n" +
  '    done(null, {stdout: stdout, stderr: stderr});';
const patchedClose =
  "proc.on('close', function (code) {\n" +
  "    done(code === 0 ? null : new Error('Deployment failed: ' + code), {stdout: stdout, stderr: stderr});";
const deploy = fs.readFileSync(deployPath, 'utf8');
if (deploy.includes(upstreamClose)) {
  fs.writeFileSync(deployPath, deploy.replace(upstreamClose, patchedClose));
  console.log('patch-admin: patched deploy.js exit-code handling');
} else if (deploy.includes(patchedClose)) {
  console.log('patch-admin: deploy.js already patched');
} else {
  console.error(
    'patch-admin: WARNING deploy.js anchor not found -- upstream layout changed; ' +
      'a failed deploy will be reported as a success'
  );
}

// 2. index.js -- server entry point; adds the /admin/api path guards.
mirror(
  'operations/hexo-admin-index.js',
  `${ADMIN}/index.js`,
  'admin server entry (path guards)'
);

// 3. api.js -- async publish + /publish-status + /rebuild + JSON error bodies.
mirror('operations/hexo-admin-api.js', `${ADMIN}/api.js`, 'admin API (async publish)');

// 4. www/bundle.js -- the editor UI. Drives the async publish flow, rebuilds
//    the static site after an edit, and carries the Chinese interface.
mirror('operations/hexo-admin-bundle.js', `${ADMIN}/www/bundle.js`, 'admin editor bundle');

// 5. www/index.html -- pristine + viewport meta. Copied before install.cjs
//    because install.cjs injects the theme stylesheet link into this file.
mirror('operations/hexo-admin-www-index.html', `${ADMIN}/www/index.html`, 'admin www index');

// 6. Theme styling: arknights stylesheet, fonts and background for the admin UI.
require('./admin-style/install.cjs');
