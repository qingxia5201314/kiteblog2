const fs=require('fs');let p='node_modules/hexo-admin/deploy.js',s=fs.readFileSync(p,'utf8');s=s.replace("proc.on('close', function () {\n    done(null, {stdout: stdout, stderr: stderr});","proc.on('close', function (code) {\n    done(code === 0 ? null : new Error('Deployment failed: ' + code), {stdout: stdout, stderr: stderr});");fs.writeFileSync(p,s);

fs.copyFileSync('operations/hexo-admin-index.js','node_modules/hexo-admin/index.js');

fs.copyFileSync('operations/hexo-admin-api.js','node_modules/hexo-admin/api.js');
fs.copyFileSync('operations/hexo-admin-index.js','node_modules/hexo-admin/index.js');

require('./admin-style/install.cjs');
