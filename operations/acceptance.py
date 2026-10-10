import json, re, urllib.request, urllib.error, urllib.parse, pathlib, ssl, base64, time

root = pathlib.Path('/opt/kitepop-hexo-standard')
content = root / 'source'
env = dict(l.split('=', 1) for l in pathlib.Path('/etc/kitepop-blog.env').read_text().splitlines() if '=' in l)
auth = 'Basic ' + base64.b64encode(('admin:' + env['ADMIN_PASSWORD']).encode()).decode()
ctx = ssl._create_unverified_context()


def request(url, data=None, headers=None):
    # Post permalinks contain Chinese characters; the request line must be
    # ASCII, so percent-encode anything outside it.
    url = urllib.parse.quote(url, safe="/?&=%:;,+@!$'()*[]~")
    h = {'User-Agent': 'Mozilla/5.0', 'Authorization': auth}
    h.update(headers or {})
    if data is not None:
        h['Content-Type'] = 'application/json'
    req = urllib.request.Request(
        'https://kitepop.top' + url,
        data=None if data is None else json.dumps(data).encode(),
        headers=h,
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=300) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def api(u, data=None):
    c, b = request('/admin/api/' + u, data)
    assert c == 200, (u, c, b[:120])
    return json.loads(b)


def wait_for_publish(timeout=300):
    """Block until no async publish job is in flight.

    publish/unpublish hand the rebuild to a background job, and publish.sh takes
    an flock. Triggering another publish while one is running fails with
    'Another publish is running', so wait before starting a new one.
    """
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = api('publish-status')
        if not last.get('running'):
            return last
        time.sleep(2)
    raise AssertionError('publish job still running after %ss: %s' % (timeout, last))


# --- draft publish lifecycle -------------------------------------------------
# Pick whichever migration-acceptance fixture exists -- operations/verify-admin.py
# creates a fresh one named after the epoch on every run, and older ones stay
# behind. Assertions are written against the current state rather than assuming
# a freshly created draft, because a previous run's deploy may have left its
# fixture published.
posts = api('posts/list')
fixture = next((x for x in posts if x['source'].endswith('.md') and 'migration-acceptance-' in x['source']), None)
assert fixture, 'no migration-acceptance fixture found (run operations/verify-admin.py first)'
id = fixture['_id']
print('FIXTURE', fixture['source'])

# The fixture is a scratch post; only its own state is touched below, and it is
# a draft again by the time this script finishes.
if not fixture['isDraft']:
    api('posts/' + id + '/unpublish', {}); time.sleep(1)
x = api('posts/' + id)
assert x['isDraft'], ('fixture did not become a draft', x['source'])

x = api('posts/' + id)
assert 'Saved via independent' in x['_content']
print('SAVE_REOPEN_OK')
api('posts/' + id + '/publish', {}); time.sleep(1)
assert not api('posts/' + id)['isDraft']
print('PUBLISH_STATUS_OK')
api('posts/' + id + '/unpublish', {}); time.sleep(1)
assert api('posts/' + id)['isDraft']
print('UNPUBLISH_STATUS_OK')

# --- guards ------------------------------------------------------------------
assert request('/admin/api/posts/' + id, {'filename': '../../escape'})[0] == 400
print('PATH_GUARD_OK')
# Enforced by nginx (/etc/nginx/conf.d/myblog.conf), not by the app: 403 for any
# Origin other than the site's own.
assert request('/admin/api/deploy', {'message': 'test'}, headers={'Origin': 'https://evil.example'})[0] == 403
print('CSRF_GUARD_OK')

# --- every published page renders -------------------------------------------
# Assert the pages that exist rather than a fixed count, which goes stale each
# time a post is written.
posts = api('posts/list')
published = [x for x in posts if not x['isDraft']]
assert published, 'no published posts found'
for x in published:
    p = x['path'].removeprefix('admin-preview/')
    c, b = request('/' + p)
    assert c == 200, (p, c)
    assert x['title'].encode() in b, (p, 'missing title')
print('ALL_PUBLISHED_PAGES_OK', len(published))

# --- media -------------------------------------------------------------------
# operations/migrate-media.cjs moved /api/images/raw/* references; a leftover
# /api/files/raw/* one means a post still depends on the legacy Node app
# (systemd kitepop-blog.service) staying alive to serve an image.
legacy = [
    str(f.relative_to(root))
    for f in content.rglob('*.md')
    if re.search(r'/api/(?:files|images)/raw/', f.read_text(encoding='utf-8'))
]
assert not legacy, 'posts still reference the legacy media API: ' + ', '.join(legacy)
print('NO_LEGACY_MEDIA_REFS_OK')

media = json.loads((root / 'operations/media-map.json').read_text())
for u in media.values():
    assert request(u)[0] == 200, (u,)
print('ALL_MIGRATED_IMAGES_OK', len(media))

for f in sorted((content / 'media/migrated').glob('file-*')):
    c, _ = request('/media/migrated/' + f.name)
    assert c == 200, (f.name, c)
print('ALL_FILE_MIGRATED_IMAGES_OK')

# --- about page round-trip ---------------------------------------------------
pages = api('pages/list')
about = next((x for x in pages if x['source'] == 'about/index.md'), None)
assert about, 'about page not found in the admin page list'
print('ABOUT_ADMIN_OK')
api('pages/' + about['_id'], {'_content': about['_content']}); time.sleep(1)
assert about['_content'].strip() in (content / 'about/index.md').read_text(encoding='utf-8')
print('PAGE_EDIT_OK')

# --- the deploy button -------------------------------------------------------
# Wait out any rebuild still running from the publish/unpublish above: they hand
# the work to a background job, and publish.sh's flock means a second concurrent
# publish fails by design.
wait_for_publish()
x = api('deploy', {'message': 'Final acceptance publish'})
assert not x.get('error'), x
print('DEPLOY_OK')
wait_for_publish()
