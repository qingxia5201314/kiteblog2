import json, urllib.request, urllib.error, base64, ssl, pathlib, time
root=pathlib.Path('/opt/kitepop-hexo-standard')
env=dict(line.split('=',1) for line in pathlib.Path('/etc/kitepop-blog.env').read_text().splitlines() if '=' in line)
auth='Basic '+base64.b64encode(('admin:'+env['ADMIN_PASSWORD']).encode()).decode()
ctx=ssl._create_unverified_context()
def call(path,data=None,auth_on=True,timeout=60):
    headers={'Authorization':auth} if auth_on else {}
    headers['User-Agent']='Mozilla/5.0'
    if data is not None: headers['Content-Type']='application/json'
    req=urllib.request.Request('https://kitepop.top'+path, data=None if data is None else json.dumps(data).encode(),headers=headers)
    try:
        with urllib.request.urlopen(req,context=ctx,timeout=timeout) as r:
            b=r.read(); return r.status, b
    except urllib.error.HTTPError as e: return e.code,e.read()
for p in ['/admin/','/admin/api/posts/list','/admin/bundle.js','/admin/api/pages/list','/admin/api/settings/list']:
    c,b=call(p);print(p,c,len(b));assert c==200,(p,c,b[:200])
assert call('/admin/api/posts/list',auth_on=False)[0]==401
c,b=call('/admin/api/posts/new',{'title':'migration-acceptance-'+str(int(time.time()))});print('CREATE',c,b[:160]);assert c==200
post=json.loads(b);identifier=post['_id'];root.joinpath('operations/test-post.json').write_text(json.dumps(post))
c,b=call('/admin/api/posts/'+identifier,{'_content':'# Admin acceptance\n\nSaved via independent Hexo backend.','tags':['acceptance'],'categories':['verification']},timeout=30);print('UPDATE',c,b[:200]);assert c==200
png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS9sAAAAASUVORK5CYII='
c,b=call('/admin/api/images/upload',{'data':png,'filename':'admin-acceptance'});print('UPLOAD',c,b);assert c==200
c,b=call('/admin/api/deploy',{'message':'acceptance verify'},timeout=300);print('DEPLOY',c,b[-240:]);assert c==200 and not json.loads(b).get('error')
media=json.loads(root.joinpath('operations/media-map.json').read_text())
fail=[]
for u in media.values():
    c,b=call(u,auth_on=False)
    if c!=200:fail.append((u,c))
print('MIGRATED_IMAGE_CHECK',len(media),'failures',fail);assert not fail
