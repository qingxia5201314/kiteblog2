'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const project = path.resolve(process.env.HEXO_ADMIN_PROJECT || path.join(__dirname, '../..'));
const admin = path.join(project, 'node_modules/hexo-admin/www');
const theme = path.join(project, 'themes/arknights/source');
const index = path.join(admin, 'index.html');
const css = fs.readFileSync(path.join(__dirname, 'arknights-admin.css'));
const version = crypto.createHash('sha256').update(css).digest('hex').slice(0, 12);
const filename = `arknights-admin.${version}.css`;
let html = fs.readFileSync(index, 'utf8');
const anchor = '<link rel="stylesheet" href="bundle.css">';
if (html.split(anchor).length !== 2) throw new Error('Expected a single Hexo Admin bundle.css link');
html = html.replace(/\n<link rel="stylesheet" href="arknights-admin(?:\.[a-f0-9]+)?\.css">/g, '');
html = html.replace(anchor, `${anchor}\n<link rel="stylesheet" href="${filename}">`);
if (!html.includes('name="viewport"')) {
  const charset = '<meta charset="utf-8">';
  if (html.split(charset).length !== 2) throw new Error('Expected a single UTF-8 metadata element');
  html = html.replace(charset, `${charset}\n<meta name="viewport" content="width=device-width, initial-scale=1">`);
}
for (const [source, target] of [
  ['font/Bender.ttf', 'fonts/arknights-Bender.ttf'],
  ['font/BenderLight.woff2', 'fonts/arknights-BenderLight.woff2'],
  ['font/JetBrainsMono-Regular.woff2', 'fonts/arknights-JetBrainsMono-Regular.woff2'],
  ['img/faction/1.png', 'assets/arknights-rhodes.png'],
  ['img/bk.jpg', 'assets/arknights-background.jpg']
]) {
  const destination = path.join(admin, target);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(theme, source), destination);
}
fs.writeFileSync(path.join(admin, filename), css);
const temp = `${index}.style-next`;
fs.writeFileSync(temp, html);
fs.renameSync(temp, index);
console.log(`Arknights admin styles installed: ${filename}`);
