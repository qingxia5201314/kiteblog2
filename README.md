# kiteblog2

Kitepop 博客（kitepop.top）的完整源码仓库，便于版本管理与后续修改。

## 目录结构

```
blog/     Hexo 博客源站
server/   博客后端 API（文件服务 / 记账服务）
```

### blog/ — Hexo 源站

- 引擎：Hexo 8.x，主题 `arknights`（`blog/themes/arknights`）
- 文章：`blog/source/_posts/`
- 配置：`blog/_config.yml`、`blog/_config.arknights.yml`、`blog/_multiconfig.yml`
- 发布脚本：`blog/operations/publish.sh`
  - 生成到带时间戳的 release 目录，再切换 nginx 站点软链
  - 由 `operations/release.yml` 指定 `public_dir`

### server/ — 后端 API

- 运行时：Node.js（ESM）+ Hono + @hono/node-server
- 入口：`server/server/index.mjs`
- 数据：SQLite（`data/blog.sqlite`），上传文件在 `data/uploads/`
- 路由：`server/server/routes/`
- 配置：见 `server/.env.example`（实际 `.env` 不入库）

## 未纳入版本管理的目录

以下目录体积大或含运行时数据，已在 `.gitignore` / 导出时排除：

| 目录 | 原因 |
| --- | --- |
| `blog/source/media/` | 已上传媒体文件（约 36M），保留在 VPS |
| `blog/node_modules/` | 依赖，用 `npm install` 重建 |
| `blog/public/`、`blog/db.json` | 构建产物 |
| `blog/operations/cache/`、`operations/logs/` | 运行时缓存与日志 |
| `server/node_modules/` | 依赖 |
| `server/data/` | SQLite 数据库与上传文件 |
| `server/dist*/` | 前端构建产物 |

## 部署概览（VPS）

- 站点根：`/var/www/myblog-arknights` → 指向某个 release 目录
- 博客源站：`/opt/kitepop-hexo-standard`
- 后端服务：`/opt/kitepop-blog`，systemd 单元 `kitepop-blog.service`，监听 `127.0.0.1:3000`
- nginx：静态站点 + `/api/` 反向代理到后端
