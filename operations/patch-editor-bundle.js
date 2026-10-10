#!/usr/bin/env node
// Patch the hexo-admin editor bundle.
//
// operations/hexo-admin-bundle.js *is* the patched bundle (a webpack build whose
// modules are readable, one module per line), so this script rewrites it in
// place. Run it with `npm run patch:bundle` after editing the bundle by hand;
// patch-admin.cjs installs the result into node_modules.
//
// It runs against a pristine upstream bundle, so `npm pack hexo-admin@2.3.0` and
// point BUNDLE at package/www/bundle.js to start over.
//
// Two behaviour changes plus the interface translation:
//
// 1. Editing a published post rebuilt nothing.
//    handleChangeContent/handleChangeTitle save the markdown and stop there. The
//    live site is a prerendered snapshot under /var/www, so the edit stayed
//    invisible on the front end until an unrelated publish happened. Both
//    handlers now ask the backend to rebuild once the save settles, and report
//    progress in the editor's status bar.
//
// 2. A publish could not report its own failure, and the button lied while the
//    rebuild ran.
//    Upstream calls api.publish(id).then(post => setState({post})) and stops.
//    The backend answers as soon as the rebuild is *queued* -- the ~30s render
//    happens afterwards -- so the toolbar flipped immediately and a failed
//    rebuild was never surfaced. The handlers now poll publish-status via
//    api.waitForPublish, then re-read the post.
//
//   (An earlier revision of this patch also rewrote the poller to call
//    `api.publishStatus()` from inside api's own module, where `api` is not in
//    scope, so any publish threw "api is not defined". That shape is repaired
//    below and its return is a hard error.)
//
// Usage:
//   node operations/patch-editor-bundle.js [--check] [--dry-run]
//
//   --dry-run  report what would change, touch nothing
//   --check    exit non-zero if a required anchor is missing or a broken shape
//              is present, without writing anything
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = process.env.KITEPOP_BUNDLE || path.join(HERE, 'hexo-admin-bundle.js');
const DRY = process.argv.includes('--dry-run');
const CHECK = process.argv.includes('--check');

const MARKER = 'KITEPOP_EDITOR_PATCH';

// --------------------------------------------------------------------------- //
// interface translation
// --------------------------------------------------------------------------- //
// Every entry is a display literal: a React.DOM.* text child or an element
// title. None is a lookup key, a route or a className, so replacing them cannot
// change behaviour. Longest-first where one string prefixes another.
const TRANSLATIONS = [
  ['Hexo Admin', '博客后台'],
  ['New Post', '新建文章'],
  ['New page', '新建页面'],
  ['Deploy/commit message', '部署说明（提交信息）'],
  ['This is the Hexo Admin Plugin', '这里是博客后台'],
  ['Goal: Provide an awesome admin experience for managing your blog.', '目标：提供一个顺手的博客管理后台。'],
  ['Useful links:', '相关链接：'],
  ['Hexo site', 'Hexo 官网'],
  ['Github page for this plugin', '本插件的 GitHub 页面'],
  ['Published. Static site rebuilt.', '已发布，前台已更新。'],
  ['Moved back to drafts. Static site rebuilt.', '已退回草稿，前台已更新。'],
  ['Publishing...', '发布中...'],
  ['Unpublishing...', '取消发布中...'],
  ['Check for Writing Improvements', '检查写作改进建议'],
  ['Back to Preview', '返回预览'],
  ['Writing Suggestions', '写作建议'],
  ['Admin Config Section', '后台配置区'],
  ['Authentification Setup', '认证设置'],
  ['Rename File', '重命名文件'],
  ['Click to rename', '点击重命名'],
  ['Std Output', '标准输出'],
  ['Std Error', '错误输出'],
  ['Loading...', '加载中...'],
  ['Brought to you by ', '技术支持：'],
  ['Copy this into your ', '把下面内容复制到 '],
  ['Delete this post?', '删除这篇文章？'],
  ['This operation will move current draft into source/_discarded folder.', '该操作会把当前草稿移入 source/_discarded 目录。'],
  ['Yes', '确定'],
  ['No', '取消'],
  ['Posts', '文章'],
  ['Pages', '页面'],
  ['About', '关于'],
  ['Deploy', '部署'],
  ['Settings', '设置'],
  ['Author', '作者'],
  ['Categories', '分类'],
  ['Tags', '标签'],
  ['Preview', '预览'],
  ['Draft', '草稿'],
  ['Remove', '删除'],
  ['Cancel', '取消'],
  ['Publish', '发布'],
  ['Unpublish', '取消发布'],
  [' words', ' 词'],
  ['Date', '日期']
];

// --------------------------------------------------------------------------- //
// behaviour fixes
// --------------------------------------------------------------------------- //
// 1. api: add rebuild() and a bound waitForPublish. Upstream's api object is
//    built inside `module.exports = function (baseUrl)`, so anything exported
//    from there must close over `get`, not reach for the api object by name.
const API_ANCHOR = `    publish: function(id)  {return post('/posts/' + id + '/publish');},`;
const API_PATCHED = `    publish: function(id)  {return post('/posts/' + id + '/publish');},
    rebuild: function()  {return post('/rebuild');}, // ${MARKER}_API
    publishStatus: function()  {return get('/publish-status');},
    waitForPublish: function(onProgress)  {return waitForPublish(this.publishStatus, onProgress);},`;

// 2. The poller helper. Inserted once, module-level, alongside the other api
//    helpers. It takes its poll source as an argument because `api` is not in
//    scope at this level.
const POLLER_ANCHOR = `function _get(baseUrl, url, params) {`;
const POLLER_HELPER = `// ${MARKER}_POLLER: poll /publish-status until the background rebuild settles,
// reporting elapsed time so the editor is never silent during a ~30s publish.
// Takes the poller as an argument: this runs at module level, where the api
// object returned by module.exports is not in scope.
var PUBLISH_POLL_INTERVAL = 1000
var PUBLISH_POLL_MAX_MS = 10 * 60 * 1000

function waitForPublish(pollOnce, onProgress) {
  return new Promise(function (resolve, reject) {
    var started = Date.now()
    function tick() {
      pollOnce().then(function (job) {
        job = job || {}
        if (job.running) {
          var secs = Math.round((job.elapsedMs || (Date.now() - started)) / 1000)
          onProgress('\u6b63\u5728\u91cd\u5efa\u9759\u6001\u7ad9... ' + secs + 's')
          setTimeout(tick, PUBLISH_POLL_INTERVAL)
          return
        }
        if (job.state === 'succeeded') return resolve(job)
        if (job.state === 'failed') {
          return reject(new Error(job.message || 'Static site rebuild failed'))
        }
        // 'idle' means the backend restarted mid-publish; do not poll forever.
        if (job.state === 'idle') {
          return reject(new Error('Publish status was lost; check the site and retry'))
        }
        setTimeout(tick, PUBLISH_POLL_INTERVAL)
      }, function (err) {
        if (Date.now() - started > PUBLISH_POLL_MAX_MS) {
          return reject(err || new Error('Timed out waiting for the publish job'))
        }
        setTimeout(tick, PUBLISH_POLL_INTERVAL)
      })
    }
    tick()
  })
}

function _get(baseUrl, url, params) {`;

// 3. Editor save path: both Post and Page carry these two handlers verbatim
//    except for _post/_page, so the anchors below take the call name as a
//    parameter and are applied to each component.
function saveAnchors(call) {
  const titleAnchor = `  handleChangeTitle: function (title) {
    if (title === this.state.title) {
      return
    }
    this.setState({title: title});
    this.${call}({title: title})
  },
`;
  const contentAnchor = `  handleChangeContent: function (text) {
    if (text === this.state.raw) {
      return
    }
    this.setState({
      raw: text,
      updated: null,
      rendered: marked(text)
    })
    this.${call}({_content: text})
  },
`;
  // The helper block is inserted once per component, attached to the title
  // handler so the marker is unique per component.
  const helpers = `  // ${MARKER}_SAVE_${call.toUpperCase()}: after an edit settles, rebuild the static site
  // so an edit to a published post is live immediately. Drafts are skipped --
  // nothing about them is public yet, and the button still publishes them.
  // Concurrent edits collapse into one rebuild by restarting the timer.
  _scheduleRebuild: function () {
    var item = this.state && (this.state.post || this.state.page)
    if (!item || item.isDraft) return
    var self = this
    clearTimeout(this._rebuildTimer)
    this._rebuildTimer = setTimeout(function () { self._runRebuild() }, 1500)
  },

  _runRebuild: function () {
    var self = this
    this.setState({publishing: true, publishError: null, publishMessage: '\u6b63\u5728\u91cd\u5efa\u9759\u6001\u7ad9...'})
    api.rebuild().then(function () {
      return api.waitForPublish(function (message) {
        self.setState({publishMessage: message})
      })
    }).then(function () {
      self.setState({publishing: false, publishMessage: '\u5df2\u4fdd\u5b58\uff0c\u524d\u53f0\u5df2\u66f4\u65b0\u3002'})
    }, function (err) {
      self.setState({publishing: false, publishError: (err && err.message) || String(err)})
    })
  },

  handleChangeTitle: function (title) {
    if (title === this.state.title) {
      return
    }
    this.setState({title: title});
    this.${call}({title: title})
    this._scheduleRebuild()
  },
`;
  const contentPatched = `  handleChangeContent: function (text) {
    if (text === this.state.raw) {
      return
    }
    this.setState({
      raw: text,
      updated: null,
      rendered: marked(text)
    })
    this.${call}({_content: text})
    this._scheduleRebuild()
  },
`;
  return {
    titleAnchor,
    helpers,
    contentAnchor,
    contentPatched,
    // Shape of the content handler once patched. This block adds no marker of
    // its own, so idempotency is keyed on this exact text.
    contentDone: contentAnchor.replace("    this." + call + "({_content: text})\n  },\n", "    this." + call + "({_content: text})\n    this._scheduleRebuild()\n  },\n")
  };
}

// 4. Publish/unpublish over `this.state.post` and `this.state.page`.
function publishAnchors(noun) {

  // The getter differs per component: posts use api.post, pages use api.page.
  const getter = noun === 'post' ? 'post' : 'page';
  const upstream = `handlePublish: function () {
    if (!this.state.${noun}.isDraft) return
    api.publish(this.state.${noun}._id).then(function(${noun})  {
      this.setState({${noun}: ${noun}})
    }.bind(this));
  },

  handleUnpublish: function () {
    if (this.state.${noun}.isDraft) return
    api.unpublish(this.state.${noun}._id).then(function(${noun})  {
      this.setState({${noun}: ${noun}})
    }.bind(this));
  },
`;

  const patched = `handlePublish: function () { // ${MARKER}_PUB_${noun.toUpperCase()}
    if (!this.state.${noun}.isDraft) return
    var self = this
    this.setState({publishing: true, publishError: null, publishMessage: null})
    api.publish(this.state.${noun}._id).then(function (result)  {
      if (result && result.post) self.setState({${noun}: result.post})
      // The API returns as soon as the rebuild is queued; wait for it so a
      // failure is surfaced and the toolbar is not updated prematurely.
      return api.waitForPublish(function (message) {
        self.setState({publishMessage: message})
      })
    }).then(function ()  {
      return api.${getter}(self.state.${noun}._id)
    }).then(function (item)  {
      self.setState({publishing: false, ${noun}: item, publishMessage: "\u5df2\u53d1\u5e03\uff0c\u524d\u53f0\u5df2\u66f4\u65b0\u3002"})
    }, function (err)  {
      self.setState({publishing: false, publishError: (err && err.message) || String(err)})
    });
  },

  handleUnpublish: function () {
    if (this.state.${noun}.isDraft) return
    var self = this
    this.setState({publishing: true, publishError: null, publishMessage: null})
    api.unpublish(this.state.${noun}._id).then(function (result)  {
      if (result && result.post) self.setState({${noun}: result.post})
      return api.waitForPublish(function (message) {
        self.setState({publishMessage: message})
      })
    }).then(function ()  {
      return api.${getter}(self.state.${noun}._id)
    }).then(function (item)  {
      self.setState({publishing: false, ${noun}: item, publishMessage: "\u5df2\u9000\u56de\u8349\u7a3f\uff0c\u524d\u53f0\u5df2\u66f4\u65b0\u3002"})
    }, function (err)  {
      self.setState({publishing: false, publishError: (err && err.message) || String(err)})
    });
  },
`;
  return { upstream, patched };
}

// Shapes that must never survive: the poller reaching for `api` by name, which
// is not in scope inside the api module.
const FORBIDDEN = [
  ['      api.publishStatus().then(function (job) {', 'poller calls api.publishStatus() out of scope'],
  ['    waitForPublish: waitForPublish,', 'waitForPublish exported unbound (publishStatus not in scope)'],
  ['function waitForPublish(onProgress) {', 'poller has no pollOnce parameter']
];

const REPAIRS = [
  ['      api.publishStatus().then(function (job) {', '      pollOnce().then(function (job) {'],
  ['    waitForPublish: waitForPublish,', '    waitForPublish: function(onProgress)  {return waitForPublish(this.publishStatus, onProgress);},'],
  ['function waitForPublish(onProgress) {', 'function waitForPublish(pollOnce, onProgress) {']
];

// --------------------------------------------------------------------------- //
function apply(text, anchor, replacement, label, problems, marker, alreadyDone) {
  if (marker && text.includes(marker)) return text;
  // Some blocks (the content handlers) have no marker of their own: they only
  // add one call to a block inserted earlier, so idempotency is keyed on that
  // call already following the anchor's signature.
  if (alreadyDone && text.includes(alreadyDone)) return text;
  const count = text.split(anchor).length - 1;
  if (count === 0) {
    problems.push(`${label}: anchor not found`);
    return text;
  }
  if (count !== 1) {
    problems.push(`${label}: anchor matched ${count} times, expected 1`);
    return text;
  }
  return text.replace(anchor, replacement);
}

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`patch-editor-bundle: missing ${BUNDLE}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(BUNDLE, 'utf8');
  // The bundle ships CRLF. Work in LF so the anchors read naturally, then
  // restore whatever the file used.
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let text = raw.split('\r\n').join('\n');
  const original = text;
  const problems = [];

  // Repair any broken intermediate shape left by the earlier revision of this
  // patch before applying the anchors below.
  for (const [bad, good] of REPAIRS) text = text.split(bad).join(good);

  const M = MARKER;

  // api: rebuild() + bound waitForPublish + the poller helper.
  text = apply(text, API_ANCHOR, API_PATCHED, 'api.rebuild export', problems, `${M}_API`);
  text = apply(text, POLLER_ANCHOR, POLLER_HELPER, 'poller helper', problems, `${M}_POLLER`);

  // editor save path, once per component
  const postSave = saveAnchors('_post');
  const pageSave = saveAnchors('_page');
  text = apply(text, postSave.titleAnchor, postSave.helpers, 'post save -> rebuild', problems, `${M}_SAVE__POST`);
  text = apply(text, postSave.contentAnchor, postSave.contentPatched, 'post content -> rebuild', problems, null,
    postSave.contentDone);
  text = apply(text, pageSave.titleAnchor, pageSave.helpers, 'page save -> rebuild', problems, `${M}_SAVE__PAGE`);
  text = apply(text, pageSave.contentAnchor, pageSave.contentPatched, 'page content -> rebuild', problems, null,
    pageSave.contentDone);

  // publish/unpublish polling, once per component
  const postPub = publishAnchors('post');
  const pagePub = publishAnchors('page');
  text = apply(text, postPub.upstream, postPub.patched, 'post publish polling', problems, `${M}_PUB_POST`);
  text = apply(text, pagePub.upstream, pagePub.patched, 'page publish polling', problems, `${M}_PUB_PAGE`);

  // Translation last: plain find/replace, must not disturb the anchors above.
  let translated = 0;
  for (const [from, to] of TRANSLATIONS) {
    const occurrences = text.split(JSON.stringify(from)).length - 1;
    if (occurrences === 0) continue;
    text = text.split(JSON.stringify(from)).join(JSON.stringify(to));
    translated += occurrences;
  }

  // Hard failures: a forbidden shape means a publish would throw at runtime.
  for (const [shape, why] of FORBIDDEN) {
    if (text.includes(shape)) problems.push(`forbidden shape: ${why}`);
  }

  if (problems.length) {
    console.error(`patch-editor-bundle: ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    if (CHECK) process.exit(1);
  }
  if (text === original) {
    console.log('patch-editor-bundle: already up to date');
    return;
  }
  if (CHECK) {
    console.log('patch-editor-bundle: --check requested, not writing');
    return;
  }
  if (DRY) {
    const delta = text.length - original.length;
    console.log(`patch-editor-bundle: would rewrite ${delta >= 0 ? '+' : ''}${delta} bytes, ${translated} string(s) translated`);
    return;
  }
  fs.writeFileSync(BUNDLE, text.split('\n').join(eol));
  console.log(`patch-editor-bundle: patched ${path.relative(process.cwd(), BUNDLE)} (${translated} string(s) translated, ${eol === '\r\n' ? 'CRLF' : 'LF'})`);
}

main();
