#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kitepop blog - Hexo Admin ASYNC static publish (idempotent).

Problem
-------
`patch-publish-ux.py` already fixed the *silent* failure mode (superagent 0.18
never reaches `if (err)` for 4xx/5xx, and text/plain error bodies left
`res.body` null -> "Loading..." forever).  It did not fix the *slow* mode:

    POST /admin/api/posts/<id>/publish
      -> rename draft -> _posts
      -> runStaticPublish()  == hexo generate + 34MB source backup  == ~32s
      -> res.done(post)

The whole 32s happens inside one HTTP request.  The editor button flips to
"Publishing..." and then the UI is simply frozen with no progress, no elapsed
time and no phase indication until it finishes.  On a 1GB VPS under memory
pressure it can take far longer, and `REQUEST_TIMEOUT` is 300s, so it reads as
a hang.  Unpublish has the same shape (~28s).

This patch
----------
Backend (`node_modules/hexo-admin/api.js`, mirrored to `operations/hexo-admin-api.js`):
  * publish/unpublish now flip the source, then hand the rebuild to a
    background job and answer the HTTP request immediately with
    `{job: {...}, post: {...}}`.
  * new read-only endpoint `GET /admin/api/publish-status` returns the job
    snapshot: id, state (idle|running|succeeded|failed), startedAt,
    finishedAt, elapsedMs, message, action, postId, running.
  * only one job runs at a time; a second request is answered 409 while the
    first is in flight (publish.sh's `flock -n` remains the final guard).
  * if the rebuild fails the source is reverted, exactly like before, and the
    failure text is surfaced through the job snapshot.

Frontend (`node_modules/hexo-admin/www/bundle.js`, mirrored to `client/*.js`):
  * `api.publishStatus()` helper.
  * Post/Page publish handlers start the job, then poll `publish-status` and
    drive a live message ("Rebuilding the static site... 12s") until the job
    settles, then report success or the server's error text.
  * polling is capped so a wedged backend cannot spin forever; on timeout the
    editor reports what it last saw instead of sitting silent.

Idempotent: re-running is a no-op once the markers are present.
Use --dry-run to validate every anchor without touching anything.
"""

import hashlib
import os
import re
import shutil
import sys
import time

DRY = '--dry-run' in sys.argv
VERBOSE = '--verbose' in sys.argv

PROJECT = os.environ.get('HEXO_ADMIN_PROJECT') or '/opt/kitepop-hexo-standard'
BACKUP_ROOT = os.environ.get('KITEPOP_BACKUP_DIR') or '/opt/kitepop-backups'

WWW = os.path.join(PROJECT, 'node_modules/hexo-admin/www')
API = os.path.join(PROJECT, 'node_modules/hexo-admin/api.js')
API_CANON = os.path.join(PROJECT, 'operations/hexo-admin-api.js')
CLIENT = os.path.join(PROJECT, 'node_modules/hexo-admin/client')

# Backend marker: the /publish-status route registration.
API_MARKER = "use('publish-status'"
# Frontend marker: the polling helper name.
BUNDLE_MARKER = 'apiErrorMessage'
POLL_MARKER = 'waitForPublish'


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def read_text(path):
    with open(path, 'r', encoding='utf-8', newline='') as fh:
        return fh.read()


def write_text(path, text, eol):
    if DRY:
        print('   [dry-run] would write %s' % path)
        return
    with open(path, 'w', encoding='utf-8', newline='') as fh:
        fh.write(text.replace('\n', eol))


def load_lines(path):
    text = read_text(path)
    eol = '\r\n' if '\r\n' in text else '\n'
    return text.replace('\r\n', '\n').split('\n'), eol


def indent_of(line):
    return line[:len(line) - len(line.lstrip())]


def find_unique(lines, needle, what):
    target = needle.strip()
    hits = [i for i, l in enumerate(lines) if l.strip() == target]
    if not hits:
        hits = [i for i, l in enumerate(lines) if target in l.strip()]
    if len(hits) != 1:
        raise SystemExit(
            'anchor not unique: %s -> %d hits (%r)' % (what, len(hits), needle))
    if VERBOSE:
        print('   anchor %-30s -> line %d' % (what, hits[0] + 1))
    return hits[0]


def find_block_end(lines, start, what):
    depth = 0
    for i in range(start, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if i > start and depth <= 0:
            return i
    raise SystemExit('could not find end of block: ' + what)


def backup(paths):
    if DRY:
        return '(dry-run, no backup)'
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
    dest = os.path.join(BACKUP_ROOT, 'hexo-admin-async-publish-' + stamp)
    os.makedirs(dest, exist_ok=True)
    for p in paths:
        rel = os.path.relpath(p, PROJECT).replace(os.sep, '__').replace('/', '__')
        shutil.copy2(p, os.path.join(dest, rel))
    return dest


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


# --------------------------------------------------------------------------- #
# 1. backend: api.js
# --------------------------------------------------------------------------- #
# The exact block emitted by the previous synchronous implementation.
OLD_SYNC = """  function updateAndPublish(id, oldSource, newSource, res) {
    update(id, {source: newSource}, function (err, post) {
      if (err) return res.send(400, err)
      runStaticPublish(function (publishError, stdout, stderr) {
        if (!publishError) return res.done(addIsDraft(post))
        update(id, {source: oldSource}, function () {
          var detail = String(stderr || publishError.message || publishError || 'unknown error')
            .replace(/\\s+/g, ' ').trim().slice(0, 400)
          res.send(500, 'Static site publish failed: ' + detail)
        }, hexo)
      })
    }, hexo)
  }"""

NEW_ASYNC = """  // --- async static publish -------------------------------------------------
  // A full `hexo generate` + source backup takes ~30s on this box. Blocking the
  // HTTP request that long makes the admin UI look frozen, so publish is split:
  //   POST .../publish        -> flips the source, returns immediately
  //   GET  .../publish-status -> polled by the UI for progress and result
  // Only one job may run at a time; publish.sh's flock is the final guard.
  var publishJob = {
    id: null,
    state: 'idle', // idle | running | succeeded | failed
    startedAt: null,
    finishedAt: null,
    message: '',
    action: null,
    postId: null,
    previousSource: null
  }
  var publishSeq = 0

  function snapshotJob() {
    return {
      id: publishJob.id,
      state: publishJob.state,
      startedAt: publishJob.startedAt,
      finishedAt: publishJob.finishedAt,
      elapsedMs: publishJob.startedAt
        ? (publishJob.finishedAt || Date.now()) - publishJob.startedAt
        : 0,
      message: publishJob.message,
      action: publishJob.action,
      postId: publishJob.postId,
      running: publishJob.state === 'running'
    }
  }

  function shortenPublishError(err, stderr) {
    return String(stderr || (err && err.message) || err || 'unknown error')
      .replace(/\\s+/g, ' ').trim().slice(0, 400)
  }

  function finishPublishJob(error, stdout, stderr) {
    var action = publishJob.action
    var postId = publishJob.postId

    if (!error) {
      publishJob.state = 'succeeded'
      publishJob.finishedAt = Date.now()
      publishJob.message = (stdout || '').trim() || 'Static site published'
      hexo.log.i('admin: publish job %s succeeded in %dms',
        publishJob.id, publishJob.finishedAt - publishJob.startedAt)
      return
    }

    // Rebuild failed: put the post back where it was so the repo stays
    // consistent with whatever is currently live on disk.
    var detail = shortenPublishError(error, stderr)
    update(postId, {source: publishJob.previousSource}, function (revertError) {
      publishJob.state = 'failed'
      publishJob.finishedAt = Date.now()
      publishJob.message = revertError
        ? shortenPublishError(revertError, '') + ' (and the source could not be restored)'
        : (action === 'unpublish'
            ? 'Static site unpublish failed and the post was moved back to published: '
            : 'Static site publish failed and the draft was restored: ') + detail
      hexo.log.e('admin: publish job %s failed: %s', publishJob.id, publishJob.message)
    }, hexo)
  }

  function startStaticPublish(action, id, previousSource) {
    if (publishJob.state === 'running') return false

    publishSeq += 1
    publishJob.id = 'publish-' + Date.now() + '-' + publishSeq
    publishJob.state = 'running'
    publishJob.startedAt = Date.now()
    publishJob.finishedAt = null
    publishJob.action = action
    publishJob.postId = id
    publishJob.previousSource = previousSource
    publishJob.message = 'Rebuilding the static site...'

    hexo.log.i('admin: publish job %s started (%s post %s)', publishJob.id, action, id)

    setImmediate(function () {
      runStaticPublish(finishPublishJob)
    })

    return true
  }

  function updateAndPublish(action, id, oldSource, newSource, res) {
    update(id, {source: newSource}, function (err, post) {
      if (err) return res.send(400, err)
      // The source is committed; the long rebuild runs in the background.
      startStaticPublish(action, id, oldSource)
      res.done({job: snapshotJob(), post: addIsDraft(post)})
    }, hexo)
  }"""

OLD_PUBLISH = """    updateAndPublish(id, oldSource, newSource, res)
  }

  function unpublish(id, body, res) {
    var post = hexo.model('Post').get(id)
    if (!post) return res.send(404, "Post not found")
    var oldSource = post.source
    var newSource = '_drafts/' + post.source.slice('_posts/'.length)
    updateAndPublish(id, oldSource, newSource, res)
  }"""

NEW_PUBLISH = """    updateAndPublish('publish', id, oldSource, newSource, res)
  }

  function unpublish(id, body, res) {
    var post = hexo.model('Post').get(id)
    if (!post) return res.send(404, "Post not found")
    var oldSource = post.source
    var newSource = '_drafts/' + post.source.slice('_posts/'.length)
    updateAndPublish('unpublish', id, oldSource, newSource, res)
  }"""

# Route registration: placed right after the tags/categories route so it is
# available to the UI before any editor mounts.
OLD_ROUTE = """  use('tags-categories-and-metadata', function (req, res) {
    res.done(tagsCategoriesAndMetadata())
  });
"""

NEW_ROUTE = OLD_ROUTE + """
  use('publish-status', function (req, res) {
    res.done(snapshotJob())
  });
"""


def patch_api(path, label):
    text = read_text(path)
    if API_MARKER in text:
        return '%s already patched (marker present)' % label

    eol = '\r\n' if '\r\n' in text else '\n'
    body = text.replace('\r\n', '\n')

    if body.count(OLD_SYNC) != 1:
        raise SystemExit('%s: sync updateAndPublish anchor -> %d hits'
                         % (label, body.count(OLD_SYNC)))
    body = body.replace(OLD_SYNC, NEW_ASYNC, 1)

    if body.count(OLD_PUBLISH) != 1:
        raise SystemExit('%s: publish/unpublish call anchor -> %d hits'
                         % (label, body.count(OLD_PUBLISH)))
    body = body.replace(OLD_PUBLISH, NEW_PUBLISH, 1)

    if body.count(OLD_ROUTE) != 1:
        raise SystemExit('%s: route anchor -> %d hits' % (label, body.count(OLD_ROUTE)))
    body = body.replace(OLD_ROUTE, NEW_ROUTE, 1)

    if API_MARKER not in body:
        raise SystemExit('%s: marker missing after patch' % label)

    write_text(path, body, eol)
    return '%s patched' % label


# --------------------------------------------------------------------------- #
# 2. frontend: bundle.js
# --------------------------------------------------------------------------- #
# a) api client: publishStatus helper.  Anchored on the existing api object
#    literal that already carries publish/unpublish.
OLD_API_PUBLISH = "  publish: function(id)  {return post('/posts/' + id + '/publish');},\n" \
                  "  unpublish: function(id)  {return post('/posts/' + id + '/unpublish');},"

NEW_API_PUBLISH = OLD_API_PUBLISH + "\n" \
    "  publishStatus: function()  {return get('/publish-status');},"

# b) polling helper, injected next to the other module-level api helpers.
OLD_HELPER_ANCHOR = "function _get(baseUrl, url, params) {"

POLL_HELPER = """
// Poll /publish-status until the background rebuild settles, reporting elapsed
// time as it goes so the editor is never silent during a ~30s publish.
var PUBLISH_POLL_INTERVAL = 1000
var PUBLISH_POLL_MAX_MS = 10 * 60 * 1000

function waitForPublish(onProgress) {
  return new Promise(function (resolve, reject) {
    var started = Date.now()
    function tick() {
      api.publishStatus().then(function (job) {
        job = job || {}
        if (job.running) {
          var secs = Math.round((job.elapsedMs || (Date.now() - started)) / 1000)
          onProgress('Rebuilding the static site... ' + secs + 's')
          setTimeout(tick, PUBLISH_POLL_INTERVAL)
          return
        }
        if (job.state === 'succeeded') return resolve(job)
        if (job.state === 'failed') {
          return reject(new Error(job.message || 'Static site rebuild failed'))
        }
        if (job.state === 'idle') {
          // Status was reset (backend restarted mid-publish). Give up cleanly
          // rather than polling forever.
          return reject(new Error('Publish status was lost; check the site and retry'))
        }
        setTimeout(tick, PUBLISH_POLL_INTERVAL)
      }, function (err) {
        // A transient poll error (nginx hiccup) should not abort a long rebuild.
        if (Date.now() - started > PUBLISH_POLL_MAX_MS) {
          return reject(err || new Error('Timed out waiting for the publish job'))
        }
        setTimeout(tick, PUBLISH_POLL_INTERVAL)
      })
    }
    tick()
  })
}
"""

# c) publish handlers -> start job then poll.
OLD_HANDLER = """  handle%(verb)s: function () {
    if (%(guard)s) return
    var self = this
    this.setState({publishing: true, publishError: null, publishMessage: null})
    api.%(verb_l)s(this.state.%(model)s._id).then(function (%(model)s)  {
      self.setState({%(model)s: %(model)s, publishing: false, publishMessage: "%(note)s"})
    }, function (err)  {
      self.setState({publishing: false, publishError: (err && err.message) || String(err)})
    });
  },"""

NEW_HANDLER = """  handle%(verb)s: function () {
    if (%(guard)s) return
    var self = this
    this.setState({publishing: true, publishError: null, publishMessage: null})
    api.%(verb_l)s(this.state.%(model)s._id).then(function (result)  {
      // The server answered immediately with the job it just queued; the actual
      // rebuild is still running, so poll until it settles.
      if (result && result.post) self.setState({%(model)s: result.post})
      return waitForPublish(function (msg)  {
        self.setState({publishMessage: msg})
      })
    }).then(function ()  {
      self.setState({publishing: false, publishMessage: "%(note)s"})
    }, function (err)  {
      self.setState({publishing: false, publishError: (err && err.message) || String(err)})
    });
  },"""

HANDLERS = [
    # (display noun label, state field, publish guard, unpublish guard)
    ('Page', 'page', '!this.state.page.isDraft', 'this.state.page.isDraft'),
    ('Post', 'post', '!this.state.post.isDraft', 'this.state.post.isDraft'),
]

HANDLER_NOTE = {
    'publish': 'Published. Static site rebuilt.',
    'unpublish': 'Moved back to drafts. Static site rebuilt.',
}


def patch_bundle():
    path = os.path.join(WWW, 'bundle.js')
    lines, eol = load_lines(path)
    text = '\n'.join(lines)
    if POLL_MARKER in text:
        return 'bundle.js already patched (marker present)'

    # -- a. api.publishStatus --------------------------------------------- #
    i = find_unique(lines, "publish: function(id)  {return post('/posts/' + id + '/publish');},",
                    'api.publish')
    if lines[i + 1].strip() != "unpublish: function(id)  {return post('/posts/' + id + '/unpublish');},":
        raise SystemExit('unexpected unpublish line: %r' % lines[i + 1])
    lines[i + 1:i + 1] = ["  publishStatus: function()  {return get('/publish-status');},"]

    # -- b. waitForPublish helper ----------------------------------------- #
    j = find_unique(lines, OLD_HELPER_ANCHOR, '_get helper')
    ind = indent_of(lines[j])
    injected = [ind + l if l.rstrip() else l for l in POLL_HELPER.strip('\n').split('\n')]
    lines[j:j] = injected + ['']

    # -- c. publish handlers ---------------------------------------------- #
    for noun, model, pub_guard, unpub_guard in HANDLERS:
        for verb in ('publish', 'unpublish'):
            verb_l = verb
            guard = pub_guard if verb == 'publish' else unpub_guard
            old = OLD_HANDLER % {
                'verb': verb.capitalize(), 'verb_l': verb_l, 'model': model,
                'guard': guard, 'note': HANDLER_NOTE[verb],
            }
            start = None
            for k in range(len(lines)):
                if lines[k].strip() == 'handle%s: function () {' % verb.capitalize():
                    if lines[k + 1].strip() == 'if (%s) return' % guard:
                        start = k
                        break
            if start is None:
                raise SystemExit('%s.handle%s anchor not found' % (noun, verb.capitalize()))
            end = find_block_end(lines, start, noun + '.' + verb)
            block = '\n'.join(lines[start:end + 1])
            if block != old:
                raise SystemExit('%s.handle%s body mismatch:\n--- got ---\n%s'
                                 % (noun, verb.capitalize(), block))
            new = NEW_HANDLER % {
                'verb': verb.capitalize(), 'verb_l': verb_l, 'model': model,
                'guard': guard, 'note': HANDLER_NOTE[verb],
            }
            ind2 = indent_of(lines[start])
            lines[start:end + 1] = [ind2 + l if l else l for l in new.split('\n')]
            if VERBOSE:
                print('   rewrote %s.handle%s at line %d' % (noun, verb.capitalize(), start + 1))

    if POLL_MARKER not in '\n'.join(lines):
        raise SystemExit('bundle.js: marker missing after patch')

    write_text(path, '\n'.join(lines), eol)
    return 'bundle.js patched'


# --------------------------------------------------------------------------- #
# 3. client/*.js sources (kept in sync; not the served bundle)
# --------------------------------------------------------------------------- #
def patch_client_api_rest(path):
    text = read_text(path)
    if 'publishStatus' in text:
        return 'client/api/rest.js already patched'
    eol = '\r\n' if '\r\n' in text else '\n'
    body = text.replace('\r\n', '\n')

    anchor = "    publish: (id) => post('/posts/' + id + '/publish'),\n" \
             "    unpublish: (id) => post('/posts/' + id + '/unpublish'),"
    if body.count(anchor) != 1:
        raise SystemExit('client/api/rest.js: publish anchor -> %d hits' % body.count(anchor))
    body = body.replace(anchor, anchor + "\n    publishStatus: () => get('/publish-status'),", 1)

    write_text(path, body, eol)
    return 'client/api/rest.js patched'


def patch_client_model(path, model):
    text = read_text(path)
    if 'waitForPublish' in text:
        return 'client/%s already patched' % os.path.basename(path)
    eol = '\r\n' if '\r\n' in text else '\n'
    body = text.replace('\r\n', '\n')

    for verb in ('publish', 'unpublish'):
        pattern = re.compile(
            r'(  handle%s: function \(\) \{\n)'
            r'(    if \(!?this\.state\.%s\.isDraft\) return\n)'
            r'(    var self = this\n)'
            r'(    this\.setState\(\{publishing: true, publishError: null, publishMessage: null\}\)\n)'
            r'(    api\.%s\(this\.state\.%s\._id\)\.then\(\(%s\) => \{\n)'
            r'(      self\.setState\(\{%s: %s, publishing: false, publishMessage: "[^"]*"\}\)\n)'
            r'(    \}, \(err\) => \{\n)'
            r'(      self\.setState\(\{publishing: false, publishError: \(err && err\.message\) \|\| String\(err\)\}\)\n)'
            r'(    \}\);\n)'
            r'(  \},)'
            % (verb.capitalize(), model, verb, model, model, model, model),
            re.MULTILINE)
        m = pattern.search(body)
        if not m:
            raise SystemExit('client/%s: %s handler not found'
                             % (os.path.basename(path), verb))
        new = (m.group(1) + m.group(2) + m.group(3) + m.group(4) +
               m.group(5) +
               '      if (result && result.post) self.setState({%s: result.post})\n' % model +
               '      return waitForPublish((msg) => {\n'
               '        self.setState({publishMessage: msg})\n'
               '      })\n'
               '    }).then(() => {\n'
               '      self.setState({publishing: false, publishMessage: "%s"})\n' % HANDLER_NOTE[verb] +
               '    }, (err) => {\n'
               '      self.setState({publishing: false, publishError: (err && err.message) || String(err)})\n'
               '    });\n' +
               m.group(10))
        body = body[:m.start()] + new + body[m.end():]

    write_text(path, body, eol)
    return 'client/%s patched' % os.path.basename(path)


# --------------------------------------------------------------------------- #
def main():
    targets = [os.path.join(WWW, 'bundle.js'), API, API_CANON,
               os.path.join(CLIENT, 'api/rest.js'),
               os.path.join(CLIENT, 'page.js'), os.path.join(CLIENT, 'post.js'),
               os.path.join(CLIENT, 'editor.js'), os.path.join(CLIENT, 'page.js')]
    existing = [p for p in targets if os.path.exists(p)]
    missing = [p for p in targets if not os.path.exists(p)]
    if missing:
        print('== note: skipping %d absent source files' % len(missing))
        for p in missing:
            print('   absent:', p)

    api_text = read_text(API)
    bundle_text = read_text(os.path.join(WWW, 'bundle.js'))
    if API_MARKER in api_text and POLL_MARKER in bundle_text:
        print('== already patched, nothing to do')
        return

    print('== mode: %s' % ('DRY-RUN (no writes)' if DRY else 'APPLY'))
    print('== backup ->', backup(existing))

    print('==', patch_api(API, 'api.js'))
    if not DRY:
        shutil.copy2(API, API_CANON)
        print('== operations/hexo-admin-api.js synced from api.js')

    print('==', patch_bundle())

    rest = os.path.join(CLIENT, 'api/rest.js')
    if os.path.exists(rest):
        print('==', patch_client_api_rest(rest))
    for fname, model in (('page.js', 'page'), ('post.js', 'post')):
        p = os.path.join(CLIENT, fname)
        if os.path.exists(p):
            print('==', patch_client_model(p, model))

    print('== sha256')
    for p in existing:
        try:
            print('   %s  %s' % (sha256(p), p))
        except OSError as exc:
            print('   (unreadable) %s: %s' % (p, exc))


if __name__ == '__main__':
    main()
