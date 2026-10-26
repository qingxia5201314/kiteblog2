#!/usr/bin/env node
/**
 * kitepop:frontmatter-guard
 *
 * Fixes the 2026-10-26 incident where a draft's front matter was rewritten as:
 *
 *     {}
 *     date: 2026-10-26 07:23:09
 *     ---
 *     <body>
 *
 * hexo-front-matter 0.2.3 `stringifyYAML()` dumps the non-date keys with
 * js-yaml and appends the date keys by hand. When a post has no plain key left
 * (no title / tags / categories, only `date`), `yaml.dump({})` emits a bare
 * `{}` line, which js-yaml cannot combine with the following `date:` line:
 *
 *     YAMLException: end of the stream or a document separator is expected
 *     at line 2, column 1: date: ...
 *
 * From that moment every save and every publish of that post throws inside
 * update.js:34 -> api.js -> 500, the editor renders empty (the user sees the
 * draft "disappear"), and the text already on disk becomes unreachable
 * through the UI.
 *
 * Two independent guards, both idempotent:
 *   1. hexo-front-matter: never emit a bare `{}` front-matter block.
 *   2. hexo-admin/update.js: rebuild unparseable front matter from the model
 *      instead of throwing, and refuse to write a source that does not parse
 *      back (the file on disk then always stays loadable).
 *
 * Usage: node operations/patch-frontmatter-guard.cjs
 */
'use strict';

const fs = require('fs');

const ROOT = '/opt/kitepop-hexo-standard';
const HFM = ROOT + '/node_modules/hexo-admin/node_modules/hexo-front-matter/lib/front_matter.js';
const UPDATE = ROOT + '/node_modules/hexo-admin/update.js';
const MARK = 'kitepop:frontmatter-guard';

function patch(file, label, edits) {
  if (!fs.existsSync(file)) {
    console.error(`patch-frontmatter-guard: ${label}: missing ${file}`);
    process.exitCode = 1;
    return;
  }
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(MARK)) {
    console.log(`patch-frontmatter-guard: ${label} already applied (no-op)`);
    return;
  }
  let out = src;
  for (const [from, to] of edits) {
    if (!out.includes(from)) {
      console.error(`patch-frontmatter-guard: ${label}: pattern not found, aborting`);
      process.exitCode = 1;
      return;
    }
    out = out.replace(from, to);
  }
  fs.copyFileSync(file, `${file}.bak-frontmatter-guard`);
  fs.writeFileSync(file, out);
  console.log(`patch-frontmatter-guard: ${label} patched (backup: ${file}.bak-frontmatter-guard)`);
}

// 1. hexo-front-matter: `yaml.dump({})` must not produce a stray `{}` line.
patch(HFM, 'hexo-front-matter', [[
  '  var result = yaml.dump(data, options);',
  `  var result = Object.keys(data).length ? yaml.dump(data, options) : ''; // ${MARK}`,
]]);

// 2. hexo-admin/update.js: self-heal unparseable front matter, never write a
//    source that cannot be read back.
patch(UPDATE, 'hexo-admin/update.js', [
  [
    [
      '  var split = hfm.split(post.raw),',
      '    frontMatter = split.data',
      "    compiled = hfm.parse([frontMatter, '---', split.content].join('\\n'));",
    ].join('\n'),
    [
      `  // ${MARK} - one malformed source must never brick a post again.`,
      "  var split = hfm.split(typeof post.raw === 'string' ? post.raw : ''),",
      '    frontMatter = split.data,',
      '    compiled;',
      '  try {',
      "    compiled = hfm.parse([frontMatter || post.title || post.slug || 'untitled', '---', split.content || ''].join('\\n'));",
      '  } catch (e) {',
      "    hexo.log.w('admin: unparseable front matter in %s, rebuilding it: %s', post.source, e.message);",
      "    compiled = {_content: split.content || ''};",
      '  }',
      "  if (!compiled || typeof compiled !== 'object') compiled = {_content: split.content || ''};",
      '  if (!compiled._content && split.content) compiled._content = split.content;',
    ].join('\n'),
  ],
  [
    '  var raw = hfm.stringify(compiled);',
    [
      '  // kitepop:frontmatter-guard - only persist a source that parses back.',
      '  if (!compiled.title) compiled.title = post.title || post.slug || \'untitled\';',
      '  var raw;',
      '  try {',
      '    raw = hfm.stringify(compiled);',
      '    hfm.parse(raw);',
      '  } catch (e) {',
      "    return callback('内容未保存：front matter 无法序列化，磁盘上的文件保持原样（' + e.message + '）');",
      '  }',
    ].join('\n'),
  ],
]);
