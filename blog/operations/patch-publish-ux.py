#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kitepop blog - Hexo Admin publish UX fix (idempotent).

Root cause
----------
hexo-admin bundles superagent 0.18.  Request#end() builds a Response and calls
callback(null, res) for *any* HTTP status, so a 4xx/5xx never reaches the
`if (err)` branch.  Response#parseBody() only knows
`application/x-www-form-urlencoded` and `application/json`; the publish
endpoints answered `text/plain` on failure, so `res.body` stayed null and the
client ran `setState({post: null})` -> `if (!post) return <span>Loading...</span>`
-> the editor sat on "Loading..." forever with no message.
There was also no request timeout and no rejection handler, so a stalled or
failed publish was completely silent.

This patch
----------
  1. www/bundle.js - request timeout, HTTP >= 400 rejection carrying a readable
                     message, publish/unpublish button busy state + disabled,
                     inline status/error bar under the editor toolbar.
  2. api.js        - JSON error bodies ({"error": "..."}) instead of text/plain,
                     plus a whitespace-collapsed, length-bounded publish error.
  3. client/*.js   - same edits in the (currently non-buildable) sources so a
                     future rebundle keeps the behaviour.

operations/hexo-admin-api.js is refreshed from node_modules/hexo-admin/api.js so
the canonical copy used by operations/patch-admin.cjs stays byte-identical.

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

MARKER = 'editor_publish-status'
API_MARKER = 'res.end(JSON.stringify({error: message}))'


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
    """Locate the single line containing `needle` (compared stripped)."""
    target = needle.strip()
    hits = [i for i, l in enumerate(lines) if target in l.strip()]
    if len(hits) != 1:
        raise SystemExit(
            'anchor not unique: %s -> %d hits (%r)' % (what, len(hits), needle))
    if VERBOSE:
        print('   anchor %-26s -> line %d' % (what, hits[0] + 1))
    return hits[0]


def find_block_end(lines, start, what):
    """Return the index of the line closing the `{`-block that opens at `start`.

    Uses brace-depth counting so inner object literals / nested blocks do not
    terminate the scan early.
    """
    depth = 0
    for i in range(start, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if i > start and depth <= 0:
            return i
    raise SystemExit('could not find end of block: ' + what)


def replace_block(lines, opener, new_lines, what):
    start = find_unique(lines, opener, what)
    end = find_block_end(lines, start, what)
    ind = indent_of(lines[start])
    lines[start:end + 1] = [ind + l if l else l for l in new_lines]
    return lines


def backup(paths):
    if DRY:
        return '(dry-run, no backup)'
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
    dest = os.path.join(BACKUP_ROOT, 'hexo-admin-publish-ux-' + stamp)
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
# 1. www/bundle.js
# --------------------------------------------------------------------------- #
REST_HELPERS = [
    '',
    'var REQUEST_TIMEOUT = 300000',
    '',
    'function apiErrorMessage(res) {',
    "  var msg = ''",
    '  if (res) {',
    "    if (res.body && typeof res.body === 'object') {",
    "      msg = res.body.error || res.body.message || ''",
    '    }',
    "    if (!msg && typeof res.text === 'string') msg = res.text",
    '    if (!msg && res.error && res.error.message) msg = res.error.message',
    '  }',
    "  msg = String(msg || '').replace(/[\\r\\n\\t]+/g, ' ').replace(/\\s+/g, ' ').trim()",
    "  if (!msg) msg = 'Request failed' + (res && res.status ? ' with status ' + res.status : '')",
    "  if (msg.length > 400) msg = msg.slice(0, 400) + '...'",
    '  return msg',
    '}',
]

POST_NEW = [
    'function _post(baseUrl, url, data) {',
    '  return new Promise(function (f, r)  {',
    '    var req = request.post(baseUrl + url)',
    '    if (data) {',
    '      req = req.send(data)',
    '    }',
    '    req.timeout(REQUEST_TIMEOUT).end(function (err, res)  {',
    '      if (err) return r(err)',
    '      if (res && res.status >= 400) return r(new Error(apiErrorMessage(res)))',
    '      f(res ? res.body : null)',
    '    })',
    '  })',
    '}',
]

GET_NEW = [
    'function _get(baseUrl, url, params) {',
    '  return new Promise(function (f, r)  {',
    '    var req = request.get(baseUrl + url)',
    '    if (params) {',
    '      req = req.query(params)',
    '    }',
    '    req.timeout(REQUEST_TIMEOUT).end(function (err, res)  {',
    '      if (err) return r(err)',
    '      if (res && res.status >= 400) return r(new Error(apiErrorMessage(res)))',
    '      f(res ? res.body : null)',
    '    })',
    '  })',
    '}',
]

ANCHOR_POST_FN = 'function _post(baseUrl, url, data) {'
ANCHOR_GET_FN = 'function _get(baseUrl, url, params) {'
ANCHOR_EDITOR_MAIN = 'React.DOM.div({className: "editor_main"}, '

EDITOR_BUTTONS = (
    ('editor_publish', 'onPublish', 'Publish', 'Publishing...'),
    ('editor_unpublish', 'onUnpublish', 'Unpublish', 'Unpublishing...'),
)

STATUS_BAR = [
    '(this.props.publishing || this.props.publishError || this.props.publishMessage) &&',
    'React.DOM.div({className: cx({',
    '  "editor_publish-status": true, ',
    '  "editor_publish-status--busy": !!this.props.publishing, ',
    '  "editor_publish-status--error": !!this.props.publishError',
    '})}, ',
    '  this.props.publishError ? "Publish failed: " + this.props.publishError : (this.props.publishMessage || "")',
    '), ',
]

HANDLER_NOTE = {
    'publish': 'Published. Static site rebuilt.',
    'unpublish': 'Moved back to drafts. Static site rebuilt.',
}


def patch_bundle():
    path = os.path.join(WWW, 'bundle.js')
    lines, eol = load_lines(path)
    if any(MARKER in l for l in lines):
        return 'bundle.js already patched (marker present)'

    # -- 1a. rest.js: timeout + HTTP error rejection ----------------------- #
    anchor = find_unique(lines, ANCHOR_POST_FN, 'rest _post')
    lines[anchor:anchor] = REST_HELPERS
    replace_block(lines, ANCHOR_POST_FN, POST_NEW, '_post')
    replace_block(lines, ANCHOR_GET_FN, GET_NEW, '_get')

    # -- 1b. editor buttons: busy label + disabled ------------------------- #
    for cls, handler, label, busy in EDITOR_BUTTONS:
        i = find_unique(
            lines,
            'React.DOM.button({className: "%s", onClick: this.props.%s}, '
            % (cls, handler),
            cls + ' button')
        ind = indent_of(lines[i])
        lines[i] = ('%sReact.DOM.button({className: "%s", onClick: this.props.%s, '
                    'disabled: this.props.publishing}, ' % (ind, cls, handler))
        j = i + 1
        if lines[j].strip() != '"%s"' % label:
            raise SystemExit('unexpected %s label line: %r' % (cls, lines[j]))
        lines[j] = '%s(this.props.publishing ? "%s" : "%s")' % (
            ind + '  ', busy, label)

    # -- 1c. editor status / error bar ------------------------------------ #
    main = find_unique(lines, ANCHOR_EDITOR_MAIN, 'editor_main')
    ind = indent_of(lines[main])
    lines[main:main] = [ind + l if l.rstrip() else l for l in STATUS_BAR]

    # -- 1d. Post/Page publish handlers ----------------------------------- #
    # NOTE: 'handlePublish: function () {' occurs twice (Post + Page), so the
    # call line is used as the unique anchor and the handler start is derived.
    for model, noun in (('post', 'Post'), ('page', 'Page')):
        for verb in ('publish', 'unpublish'):
            call = 'api.%s(this.state.%s._id).then(' % (verb, model)
            i = find_unique(lines, call, '%s.handle%s call' % (noun, verb.capitalize()))
            start = i - 2
            label = '%s.handle%s' % (noun, verb.capitalize())
            if lines[start].strip() != 'handle%s: function () {' % verb.capitalize():
                raise SystemExit('unexpected handler start: %r' % lines[start])
            want_guard = 'if (%sthis.state.%s.isDraft) return' % (
                '' if verb == 'unpublish' else '!', model)
            if lines[start + 1].strip() != want_guard:
                raise SystemExit('unexpected %s guard: %r (want %r)'
                                 % (label, lines[start + 1].strip(), want_guard))
            end = find_block_end(lines, start, label)
            ind = indent_of(lines[start])
            new = [
                'handle%s: function () {' % verb.capitalize(),
                '  if (%sthis.state.%s.isDraft) return' % ('' if verb == 'unpublish' else '!', model),
                '  var self = this',
                '  this.setState({publishing: true, publishError: null, publishMessage: null})',
                '  api.%s(this.state.%s._id).then(function (%s)  {' % (verb, model, model),
                '    self.setState({%s: %s, publishing: false, publishMessage: "%s"})'
                % (model, model, HANDLER_NOTE[verb]),
                '  }, function (err)  {',
                '    self.setState({publishing: false, publishError: (err && err.message) || String(err)})',
                '  });',
                '},',
            ]
            lines[start:end + 1] = [ind + l if l else l for l in new]

    # -- 1e. render props -------------------------------------------------- #
    hits = [i for i, l in enumerate(lines)
            if l.strip() == 'onUnpublish: this.handleUnpublish,']
    if len(hits) != 2:
        raise SystemExit('expected 2 onUnpublish render props, got %d' % len(hits))
    for i in sorted(hits, reverse=True):
        following = lines[i + 1].strip()
        if following.startswith('onRemove:'):
            noun = 'Post'
        elif following.startswith('tagsCategoriesAndMetadata:'):
            noun = 'Page'
        else:
            raise SystemExit('cannot classify onUnpublish at line %d: %r'
                             % (i + 1, following))
        ind = indent_of(lines[i])
        lines[i + 1:i + 1] = [
            ind + 'publishing: this.state.publishing, ',
            ind + 'publishError: this.state.publishError, ',
            ind + 'publishMessage: this.state.publishMessage, ',
        ]
        if VERBOSE:
            print('   render props inserted for %s at line %d' % (noun, i + 2))

    write_text(path, '\n'.join(lines), eol)
    return 'bundle.js patched'

# --------------------------------------------------------------------------- #
# 2. api.js (server) + canonical copy
# --------------------------------------------------------------------------- #
OLD_SEND = [
    '      res.send = function (num, data) {',
    '        res.statusCode = num',
    '        res.end(data)',
    '      }',
]
NEW_SEND = [
    '      res.send = function (num, data) {',
    '        res.statusCode = num',
    '        var message = data',
    "        if (data instanceof Error) message = data.message",
    "        else if (data && typeof data === 'object' && data.message) message = data.message",
    "        if (typeof message !== 'string') message = String(message)",
    '        message = message.trim()',
    "        if (!message) { res.setHeader('Content-type', 'text/plain'); return res.end('') }",
    "        res.setHeader('Content-type', 'application/json')",
    '        res.end(JSON.stringify({error: message}))',
    '      }',
]

OLD_PUBLISH_FAIL = ("          res.send(500, 'Static site publish failed: ' + "
                    "(stderr || publishError.message || publishError))")
NEW_PUBLISH_FAIL = [
    "          var detail = String(stderr || publishError.message || publishError || 'unknown error')",
    "            .replace(/\\s+/g, ' ').trim().slice(0, 400)",
    "          res.send(500, 'Static site publish failed: ' + detail)",
]


def patch_api(path):
    lines, eol = load_lines(path)
    if API_MARKER in '\n'.join(lines):
        return '%s already patched (marker present)' % os.path.basename(path)

    i = find_unique(lines, OLD_SEND[0], 'res.send wrapper')
    if lines[i:i + len(OLD_SEND)] != OLD_SEND:
        raise SystemExit('unexpected res.send wrapper body: %r' % lines[i:i + 4])
    lines[i:i + len(OLD_SEND)] = NEW_SEND

    j = find_unique(lines, OLD_PUBLISH_FAIL, 'publish failure')
    lines[j:j + 1] = NEW_PUBLISH_FAIL

    write_text(path, '\n'.join(lines), eol)
    return '%s patched' % os.path.basename(path)


# --------------------------------------------------------------------------- #
# 3. client/*.js sources (kept in sync; not the served bundle)
# --------------------------------------------------------------------------- #
def patch_client_rest(path):
    text = read_text(path)
    if 'REQUEST_TIMEOUT' in text:
        return 'client/api/rest.js already patched'
    eol = '\r\n' if '\r\n' in text else '\n'
    body = text.replace('\r\n', '\n')

    anchor = 'var Promise = require(\'es6-promise\').Promise\n'
    if body.count(anchor) != 1:
        raise SystemExit('client/api/rest.js: Promise require anchor not unique')
    helpers = '\n'.join(REST_HELPERS[1:]) + '\n'  # drop leading blank
    body = body.replace(anchor, anchor + '\n' + helpers + '\n', 1)

    old_req = ('    req.end((err, res) => {\n'
               '      if (err) return r(err)\n'
               '      f(res.body)\n'
               '    })')
    if body.count(old_req) != 2:
        raise SystemExit('client/api/rest.js: expected 2 request bodies, got %d'
                         % body.count(old_req))
    new_req = ('    req.timeout(REQUEST_TIMEOUT).end((err, res) => {\n'
               '      if (err) return r(err)\n'
               '      if (res && res.status >= 400) return r(new Error(apiErrorMessage(res)))\n'
               '      f(res ? res.body : null)\n'
               '    })')
    body = body.replace(old_req, new_req)

    if body.count('new Error(apiErrorMessage(res))') != 2:
        raise SystemExit('client/api/rest.js: request bodies were not rewritten')

    write_text(path, body, eol)
    return 'client/api/rest.js patched'


def patch_client_editor(path):
    text = read_text(path)
    if MARKER in text:
        return 'client/editor.js already patched'
    eol = '\r\n' if '\r\n' in text else '\n'
    body = text.replace('\r\n', '\n')

    before = body
    for cls, handler, label in (('editor_publish', 'onPublish', 'Publish'),
                                ('editor_unpublish', 'onUnpublish', 'Unpublish')):
        old = '<button className="%s" onClick={this.props.%s}>' % (cls, handler)
        if body.count(old) != 1:
            raise SystemExit('client/editor.js: %s button not found' % cls)
        body = body.replace(old, old[:-1] + ' disabled={this.props.publishing}>')
        pattern = re.compile(
            r'(<button className="%s"[^>]*>)\n(\s*)%s\n' % (cls, re.escape(label)))
        body, n = pattern.subn(
            lambda m: '%s\n%s{this.props.publishing ? "%s..." : "%s"}\n'
                      % (m.group(1), m.group(2), label, label), body, count=1)
        if n != 1:
            raise SystemExit('client/editor.js: %s label not rewritten' % cls)
    if body == before:
        raise SystemExit('client/editor.js: nothing changed')

    anchor = '      <div className="editor_main">'
    if body.count(anchor) != 1:
        raise SystemExit('client/editor.js: editor_main anchor not unique')
    bar = ('      {(this.props.publishing || this.props.publishError || this.props.publishMessage) &&\n'
           '        <div className={cx({\n'
           '          "editor_publish-status": true,\n'
           '          "editor_publish-status--busy": !!this.props.publishing,\n'
           '          "editor_publish-status--error": !!this.props.publishError\n'
           '        })}>\n'
           '          {this.props.publishError ? "Publish failed: " + this.props.publishError : '
           '(this.props.publishMessage || "")}\n'
           '        </div>}\n')
    body = body.replace(anchor, bar + anchor, 1)

    write_text(path, body, eol)
    return 'client/editor.js patched'


CLIENT_HANDLERS = (
    ('post.js', 'post', 'Post'),
    ('page.js', 'page', 'Page'),
)


def patch_client_model(path, model, noun):
    text = read_text(path)
    if 'publishError' in text:
        return '%s already patched' % os.path.basename(path)
    eol = '\r\n' if '\r\n' in text else '\n'
    body = text.replace('\r\n', '\n')

    for verb in ('publish', 'unpublish'):
        # Capture the guard line verbatim: the shipped source has
        # `if (this.state.post.isDraft) return` on unpublish (no leading `!`),
        # which is an upstream quirk worth preserving.
        pattern = re.compile(
            r'(  handle%s: function \(\) \{\n)'
            r'(    if \(!?this\.state\.%s\.isDraft\) return\n)'
            r'(    api\.%s\(this\.state\.%s\._id\)\.then\(\(%s\) => \{\n)'
            r'(      this\.setState\(\{%s: %s\}\)\n)'
            r'(    \}\);\n)'
            r'(  \},)'
            % (verb.capitalize(), model, verb, model, model, model, model),
            re.MULTILINE)
        m = pattern.search(body)
        if not m:
            raise SystemExit('client/%s: %s handler not found'
                             % (os.path.basename(path), verb))
        new = (m.group(1) + m.group(2) +
               '    var self = this\n'
               '    this.setState({publishing: true, publishError: null, publishMessage: null})\n' +
               m.group(3) +
               '      self.setState({%s: %s, publishing: false, publishMessage: "%s"})\n'
               % (model, model, HANDLER_NOTE[verb]) +
               '    }, (err) => {\n'
               '      self.setState({publishing: false, publishError: (err && err.message) || String(err)})\n'
               '    });\n' +
               m.group(6))
        body = body[:m.start()] + new + body[m.end():]

    props = ('      onPublish: this.handlePublish,\n'
             '      onUnpublish: this.handleUnpublish,\n')
    if body.count(props) != 1:
        raise SystemExit('client/%s: render props not found' % os.path.basename(path))
    body = body.replace(
        props,
        props +
        '      publishing: this.state.publishing,\n'
        '      publishError: this.state.publishError,\n'
        '      publishMessage: this.state.publishMessage,\n', 1)

    write_text(path, body, eol)
    return 'client/%s patched' % os.path.basename(path)


# --------------------------------------------------------------------------- #
def main():
    targets = [os.path.join(WWW, 'bundle.js'), API, API_CANON,
               os.path.join(CLIENT, 'editor.js'), os.path.join(CLIENT, 'post.js'),
               os.path.join(CLIENT, 'page.js'), os.path.join(CLIENT, 'api/rest.js')]
    missing = [p for p in targets if not os.path.exists(p)]
    if missing:
        raise SystemExit('missing files: ' + ', '.join(missing))

    bundle_text = read_text(os.path.join(WWW, 'bundle.js'))
    api_text = read_text(API)
    if MARKER in bundle_text and API_MARKER in api_text:
        print('== already patched, nothing to do')
        return

    print('== mode: %s' % ('DRY-RUN (no writes)' if DRY else 'APPLY'))
    print('== backup ->', backup(targets))

    print('==', patch_bundle())
    print('==', patch_api(API))
    if not DRY:
        shutil.copy2(API, API_CANON)
        print('== operations/hexo-admin-api.js synced from api.js')

    print('==', patch_client_rest(os.path.join(CLIENT, 'api/rest.js')))
    print('==', patch_client_editor(os.path.join(CLIENT, 'editor.js')))
    for fname, model, noun in CLIENT_HANDLERS:
        print('==', patch_client_model(os.path.join(CLIENT, fname), model, noun))

    print('== sha256')
    for p in targets:
        try:
            print('   %s  %s' % (sha256(p), p))
        except OSError as exc:
            print('   (unreadable) %s: %s' % (p, exc))


if __name__ == '__main__':
    main()
