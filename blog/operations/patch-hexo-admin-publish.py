from pathlib import Path

path = Path('/opt/kitepop-hexo-standard/node_modules/hexo-admin/api.js')
text = path.read_text()
old_import = "  , deploy = require('./deploy')\n"
new_import = "  , deploy = require('./deploy')\n  , childProcess = require('child_process')\n"
if old_import not in text:
    raise SystemExit('deploy import anchor not found')
text = text.replace(old_import, new_import, 1)
old_funcs = '''  function publish(id, body, res) {
    var post = hexo.model('Post').get(id)
    if (!post) return res.send(404, "Post not found")
    var newSource = '_posts/' + post.source.slice('_drafts/'.length)
    update(id, {source: newSource}, function (err, post) {
      if (err) {
        return res.send(400, err);
      }
      res.done(addIsDraft(post))
    }, hexo)
  }

  function unpublish(id, body, res) {
    var post = hexo.model('Post').get(id)
    if (!post) return res.send(404, "Post not found")
    var newSource = '_drafts/' + post.source.slice('_posts/'.length)
    update(id, {source: newSource}, function (err, post) {
      if (err) {
        return res.send(400, err);
      }
      res.done(addIsDraft(post))
    }, hexo)
  }
'''
new_funcs = '''  function runStaticPublish(done) {
    childProcess.execFile('/bin/bash', ['/opt/kitepop-hexo-standard/operations/publish.sh'], {
      cwd: '/opt/kitepop-hexo-standard',
      timeout: 300000,
      maxBuffer: 4 * 1024 * 1024
    }, function (error, stdout, stderr) {
      if (error) return done(error, stdout || '', stderr || '')
      done(null, stdout || '', stderr || '')
    })
  }

  function updateAndPublish(id, oldSource, newSource, res) {
    update(id, {source: newSource}, function (err, post) {
      if (err) return res.send(400, err)
      runStaticPublish(function (publishError, stdout, stderr) {
        if (!publishError) return res.done(addIsDraft(post))
        update(id, {source: oldSource}, function () {
          res.send(500, 'Static site publish failed: ' + (stderr || publishError.message || publishError))
        }, hexo)
      })
    }, hexo)
  }

  function publish(id, body, res) {
    var post = hexo.model('Post').get(id)
    if (!post) return res.send(404, "Post not found")
    var oldSource = post.source
    var newSource = '_posts/' + post.source.slice('_drafts/'.length)
    updateAndPublish(id, oldSource, newSource, res)
  }

  function unpublish(id, body, res) {
    var post = hexo.model('Post').get(id)
    if (!post) return res.send(404, "Post not found")
    var oldSource = post.source
    var newSource = '_drafts/' + post.source.slice('_posts/'.length)
    updateAndPublish(id, oldSource, newSource, res)
  }
'''
if old_funcs not in text:
    raise SystemExit('publish functions anchor not found')
text = text.replace(old_funcs, new_funcs, 1)
Path('/opt/kitepop-hexo-standard/operations/hexo-admin-api.js').write_text(text)
path.write_text(text)
print('patched publish and unpublish auto-deploy')
