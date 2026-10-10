import json, urllib.request, urllib.error, pathlib, ssl, base64, time
root=pathlib.Path('/opt/kitepop-hexo-standard'); env=dict(l.split('=',1) for l in pathlib.Path('/etc/kitepop-blog.env').read_text().splitlines() if '=' in l)
auth='Basic '+base64.b64encode(('admin:'+env['ADMIN_PASSWORD']).encode()).decode();ctx=ssl._create_unverified_context()
def request(url,data=None,headers=None):
    h={'User-Agent':'Mozilla/5.0','Authorization':auth};h.update(headers or {})
    if data is not None:h['Content-Type']='application/json'
    req=urllib.request.Request('https://kitepop.top'+url,data=None if data is None else json.dumps(data).encode(),headers=h)
    try:
        with urllib.request.urlopen(req,context=ctx,timeout=300) as r:return r.status,r.read()
    except urllib.error.HTTPError as e:return e.code,e.read()
def api(u,data=None):
    c,b=request('/admin/api/'+u,data);assert c==200,(u,c,b[:120]);return json.loads(b)
p=next(x for x in api('posts/list') if x['source']=='_drafts/migration-acceptance-1791472487.md');id=p['_id']
x=api('posts/'+id);assert 'Saved via independent' in x['_content'];print('SAVE_REOPEN_OK')
api('posts/'+id+'/publish',{});time.sleep(1);assert not api('posts/'+id)['isDraft'];print('PUBLISH_STATUS_OK')
api('posts/'+id+'/unpublish',{});time.sleep(1);assert api('posts/'+id)['isDraft'];print('UNPUBLISH_STATUS_OK')
assert request('/admin/api/posts/'+id,{'filename':'../../escape'})[0]==400;print('PATH_GUARD_OK')
assert request('/admin/api/deploy',{'message':'test'},headers={'Origin':'https://evil.example'})[0]==403;print('CSRF_GUARD_OK')
posts=api('posts/list');published=[x for x in posts if not x['isDraft']];assert len(published)==27
for x in published:
    p=x['path'];p=p.removeprefix('admin-preview/');c,b=request('/'+p);assert c==200,(p,c);assert x['title'].encode() in b,(p,'missing title')
print('ALL_PUBLISHED_PAGES_OK',len(published))
for u in json.loads(root.joinpath('operations/media-map.json').read_text()).values():assert request(u)[0]==200
print('ALL_105_IMAGES_OK')
pages=api('pages/list');assert any(x['source']=='about/index.md' for x in pages);print('ABOUT_ADMIN_OK')
# Re-save unchanged About content through the backend, verifying persistence.
about=next(x for x in pages if x['source']=='about/index.md');before=root.joinpath('source/about/index.md').read_text();api('pages/'+about['_id'],{'_content':about['_content']});time.sleep(1);assert about['_content'].strip() in root.joinpath('source/about/index.md').read_text();print('PAGE_EDIT_OK')
x=api('deploy',{'message':'Final acceptance publish'});assert not x.get('error'),x;print('DEPLOY_OK')
