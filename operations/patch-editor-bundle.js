#!/usr/bin/env node
// Patch the hexo-admin editor bundle.
//
// Unlike the other operations/patch-*.js scripts this one does not copy a
// checked-in file over node_modules: operations/hexo-admin-bundle.js *is* the
// patched bundle, so it is the source of truth and this script rewrites it in
// place. Run it from `npm run patch:bundle` after editing the bundle by hand, or
// let patch-admin.cjs install the result.
//
// Two behavioural fixes plus the interface translation:
//
// 1. Editing a published post rebuilt nothing.
//    handleChangeContent/handleChangeTitle save the markdown through the API and
//    stop there. The live site is a prerendered snapshot under /var/www, so the
//    edit stayed invisible on the front end until some unrelated publish
//    happened. Both handlers now ask the backend to rebuild once the save
//    settles, and report progress in the editor's status bar.
//
// 2. Publish/unpublish never refreshed.
//    handlePublish/handleUnpublish called api.publish() and immediately claimed
//    "Published. Static site rebuilt." The backend answers as soon as it has
//    *queued* the job, so the button kept reading "Unpublish" over a post that
//    was still a draft, and the status bar lied. The helpers wired up here
//    (waitForPublish) already existed but were never called.
//
// Usage:
//   node operations/patch-editor-bundle.js [--check] [--dry-run]
//
//   --dry-run  report what would change, touch nothing
//   --check    exit non-zero if any expected anchor is missing or already
//              applied in a way that suggests drift
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.join(HERE, 'hexo-admin-bundle.js');
const DRY = process.argv.includes('--dry-run');
const CHECK = process.argv.includes('--check');

const MARKER = 'KITEPOP_EDITOR_PATCH';

// --------------------------------------------------------------------------- //
// interface translation
// --------------------------------------------------------------------------- //
// Every one of these is a literal in a React.DOM.* text position or an element
// title. None is used as a lookup key, a route, or a className, so replacing
// them cannot change behaviour. The pairs are ordered longest-first where one
// string is a prefix of another ("Publishing..." before "Publish").
const TRANSLATIONS = [
  ['Hexo Admin', '博客后台'],
  ['New Post', '新建文章'],
  ['New page', '新建页面'],
  ['Deploy/commit message', '部署说明（提交信息）'],
  ['Published. Static site rebuilt.', '已发布，静态站已重建。'],
  ['Moved back to drafts. Static site rebuilt.', '已退回草稿，静态站已重建。'],
  ['Rebuilding the static site... ', '正在重建静态站... '],
  ['Publishing...', '发布中...'],
  ['Unpublishing...', '取消发布中...'],
  ['Check for Writing Improvements', '检查写作改进建议'],
  ['Back to Preview', '返回预览'],
  ['Writing Suggestions', '写作建议'],
  ['Admin Config Section', '后台配置区'],
  ['Auth setup', '认证设置'],
  ['Authentification Setup', '认证设置'],
  ['Deploy/commit', '部署/提交'],
  ['Rename File', '重命名文件'],
  ['Click to rename', '点击重命名'],
  ['Std Output', '标准输出'],
  ['Std Error', '错误输出'],
  ['Loading...', '加载中...'],
  ['Brought to you by ', '技术支持：'],
  ['Copy this into your ', '把下面内容复制到 '],
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
// The editor's save path, shared by the content and title handlers. Inserted
// into both Post and Page components, whose handlers are byte-identical.
const SAVE_ANCHOR = `  handleChangeTitle: function (title) {
    if (title === this.state.title) {
      return
    }
    this.setState({title: title});
    this._post({title: title})
  },
`;

const SAVE_PATCHED = `  // ${MARKER}_SAVE: after an edit settles, rebuild the static site so a published
  // post is live immediately. Drafts are skipped: nothing about them is public
  // yet, and the button still publishes them. Concurrent edits collapse into one
  // rebuild by (re)starting the debounce timer.
  _scheduleRebuild: function () {
    if (!this.state || !this.state.post && !this.state.page) return
    var item = this.state.post || this.state.page
    if (!item || item.isDraft) return
    var self = this
    clearTimeout(this._rebuildTimer)
    this._rebuildTimer = setTimeout(function () {
      self._runRebuild()
    }, 1500)
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
    this._post({title: title})
    this._scheduleRebuild()
  },
`;

// Content handler: older builds pass the text straight through, the patched
// builds already update state first.
const CONTENT_ANCHOR = `  handleChangeContent: function (text) {
    if (text === this.state.raw) {
      return
    }
    this.setState({
      raw: text,
      updated: null,
      rendered: marked(text)
    })
    this._post({_content: text})
  },
`;

const CONTENT_PATCHED = `  handleChangeContent: function (text) {
    if (text === this.state.raw) {
      return
    }
    this.setState({
      raw: text,
      updated: null,
      rendered: marked(text)
    })
    this._post({_content: text})
    this._scheduleRebuild() // ${MARKER}_CONTENT
  },
`;

// Publish: actually wait for the rebuild instead of claiming success on queue.
const PUBLISH_ANCHOR = `      api.publish(this.state.post._id).then(function (result)  {
        // The server answered immediately with the job it just queued; the actual
        // rebuild is still running, so poll until it settles.
        if (result && result.post) self.setState({post: result.post})
        // Publish queued; rebuild in background
      }).then(function ()  {
        self.setState({publishing: false, publishMessage: "Published. Static site rebuilt."})
      }, function (err)  {
        self.setState({publishing: false, publishError: (err && err.message) || String(err)})
      });
    },

    handleUnpublish: function () {
      if (this.state.post.isDraft) return
      var self = this
      this.setState({publishing: true, publishError: null, publishMessage: null})
      api.unpublish(this.state.post._id).then(function (result)  {
        // The server answered immediately with the job it just queued; the actual
        // rebuild is still running, so poll until it settles.
        if (result && result.post) self.setState({post: result.post})
        // Publish queued; rebuild in background
      }).then(function ()  {
        self.setState({publishing: false, publishMessage: "Moved back to drafts. Static site rebuilt."})
      }, function (err)  {
        self.setState({publishing: false, publishError: (err && err.message) || String(err)})
      });
    },
`;

const PUBLISH_PATCHED = `      // ${MARKER}_POSTPUB: the API returns as soon as the rebuild is queued, so wait for
      // the job before reporting anything, then adopt the post's new state --
      // that is what flips the toolbar between Publish and Unpublish.
      api.publish(this.state.post._id).then(function (result)  {
        if (result && result.post) self.setState({post: result.post})
        return api.waitForPublish(function (message) {
          self.setState({publishMessage: message})
        })
      }).then(function ()  {
        return api.post(self.state.post._id)
      }).then(function (post)  {
        self.setState({publishing: false, post: post, publishMessage: "\u5df2\u53d1\u5e03\uff0c\u524d\u53f0\u5df2\u66f4\u65b0\u3002"})
      }, function (err)  {
        self.setState({publishing: false, publishError: (err && err.message) || String(err)})
      });
    },

    handleUnpublish: function () {
      if (this.state.post.isDraft) return
      var self = this
      this.setState({publishing: true, publishError: null, publishMessage: null})
      api.unpublish(this.state.post._id).then(function (result)  {
        if (result && result.post) self.setState({post: result.post})
        return api.waitForPublish(function (message) {
          self.setState({publishMessage: message})
        })
      }).then(function ()  {
        return api.post(self.state.post._id)
      }).then(function (post)  {
        self.setState({publishing: false, post: post, publishMessage: "\u5df2\u9000\u56de\u8349\u7a3f\uff0c\u524d\u53f0\u5df2\u66f4\u65b0\u3002"})
      }, function (err)  {
        self.setState({publishing: false, publishError: (err && err.message) || String(err)})
      });
    },
`;

// The Page (static page) component has the same two handlers over state.page.
const PAGE_PUBLISH_ANCHOR = `      api.publish(this.state.page._id).then(function (result)  {
        // The server answered immediately with the job it just queued; the actual
        // rebuild is still running, so poll until it settles.
        if (result && result.post) self.setState({page: result.post})
        // Publish queued; rebuild in background
      }).then(function ()  {
        self.setState({publishing: false, publishMessage: "Published. Static site rebuilt."})
      }, function (err)  {
        self.setState({publishing: false, publishError: (err && err.message) || String(err)})
      });
    },

    handleUnpublish: function () {
      if (this.state.page.isDraft) return
      var self = this
      this.setState({publishing: true, publishError: null, publishMessage: null})
      api.unpublish(this.state.page._id).then(function (result)  {
        // The server answered immediately with the job it just queued; the actual
        // rebuild is still running, so poll until it settles.
        if (result && result.post) self.setState({page: result.post})
        // Publish queued; rebuild in background
      }).then(function ()  {
        self.setState({publishing: false, publishMessage: "Moved back to drafts. Static site rebuilt."})
      }, function (err)  {
        self.setState({publishing: false, publishError: (err && err.message) || String(err)})
      });
    },
`;

const PAGE_PUBLISH_PATCHED = `      // ${MARKER}_PAGEPUB
      api.publish(this.state.page._id).then(function (result)  {
        if (result && result.post) self.setState({page: result.post})
        return api.waitForPublish(function (message) {
          self.setState({publishMessage: message})
        })
      }).then(function ()  {
        return api.page(self.state.page._id)
      }).then(function (page)  {
        self.setState({publishing: false, page: page, publishMessage: "\u5df2\u53d1\u5e03\uff0c\u524d\u53f0\u5df2\u66f4\u65b0\u3002"})
      }, function (err)  {
        self.setState({publishing: false, publishError: (err && err.message) || String(err)})
      });
    },

    handleUnpublish: function () {
      if (this.state.page.isDraft) return
      var self = this
      this.setState({publishing: true, publishError: null, publishMessage: null})
      api.unpublish(this.state.page._id).then(function (result)  {
        if (result && result.post) self.setState({page: result.post})
        return api.waitForPublish(function (message) {
          self.setState({publishMessage: message})
        })
      }).then(function ()  {
        return api.page(self.state.page._id)
      }).then(function (page)  {
        self.setState({publishing: false, page: page, publishMessage: "\u5df2\u9000\u56de\u8349\u7a3f\uff0c\u524d\u53f0\u5df2\u66f4\u65b0\u3002"})
      }, function (err)  {
        self.setState({publishing: false, publishError: (err && err.message) || String(err)})
      });
    },
`;

// Expose rebuild() on the api object. waitForPublish and publishStatus already
// exist; only the new endpoint needs wiring.
const API_ANCHOR = `    publish: function(id)  {return post('/posts/' + id + '/publish');},`;
const API_PATCHED = `    publish: function(id)  {return post('/posts/' + id + '/publish');},
    rebuild: function()  {return post('/rebuild');}, // ${MARKER}_API
    waitForPublish: waitForPublish,`;

// --------------------------------------------------------------------------- //
function apply(text, anchor, replacement, label, problems, marker) {
  // Idempotency: the marker is written into every inserted block, so its presence
  // next to the anchor's own signature means this fix already landed.
  if (marker && text.includes(marker)) return text;
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
  // The bundle is a Windows-authored artifact and ships with CRLF endings. Work
  // in LF internally so the anchors above can be written naturally, then restore
  // whatever the file actually used.
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let text = raw.split('\r\n').join('\n');
  const original = text;
  const problems = [];

  // Idempotency markers, one per inserted block.
  const M = 'KITEPOP_EDITOR_PATCH';
  text = apply(text, API_ANCHOR, API_PATCHED, 'api.rebuild export', problems, `${M}_API`);
  text = apply(text, SAVE_ANCHOR, SAVE_PATCHED, 'save -> rebuild hook', problems, `${M}_SAVE`);
  text = apply(text, CONTENT_ANCHOR, CONTENT_PATCHED, 'content change -> rebuild', problems, `${M}_CONTENT`);
  text = apply(text, PUBLISH_ANCHOR, PUBLISH_PATCHED, 'post publish polling', problems, `${M}_POSTPUB`);
  text = apply(text, PAGE_PUBLISH_ANCHOR, PAGE_PUBLISH_PATCHED, 'page publish polling', problems, `${M}_PAGEPUB`);

  // Translation last: it is a plain find/replace and must not be able to
  // confuse the structural anchors above.
  let translated = 0;
  for (const [from, to] of TRANSLATIONS) {
    const occurrences = text.split(JSON.stringify(from)).length - 1;
    if (occurrences === 0) continue;
    text = text.split(JSON.stringify(from)).join(JSON.stringify(to));
    translated += occurrences;
  }

  if (problems.length) {
    console.error('patch-editor-bundle: ' + problems.length + ' problem(s):');
    problems.forEach((p) => console.error('  - ' + p));
    if (CHECK) process.exit(1);
  }
  if (text === original) {
    console.log('patch-editor-bundle: already up to date');
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
