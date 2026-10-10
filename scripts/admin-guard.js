hexo.extend.filter.register('server_middleware', function(app) {
  app.use('/admin/api/', function(req, res, next) {
    const original = res.end;
    if (/^\/posts(?:\/list)?(?:\/|$)/.test(req.url)) {
      res.end = function(chunk, encoding, callback) {
        if (typeof chunk === 'string' && chunk[0] === '[') {
          try { const rows=JSON.parse(chunk); rows.forEach(p => { if (p.path) p.path='admin-preview/'+p.path; }); chunk=JSON.stringify(rows); } catch (_) {}
        }
        return original.call(this,chunk,encoding,callback);
      };
    }
    next();
  });
}, 0);
