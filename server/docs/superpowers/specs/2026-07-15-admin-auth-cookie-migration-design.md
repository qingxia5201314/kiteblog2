# 管理员鉴权与 Cookie 会话迁移设计

## 背景

当前项目同时维护三套登录状态：

- `ADMIN_PASSWORD` 换取独立后台 Bearer token；
- 同一个 `ADMIN_PASSWORD` 换取独立记账 Bearer token；
- 站内用户账号换取保存在 `localStorage` 的用户 Bearer token。

线上数据库已有且仅有一个 `permission = 'admin'` 的用户。迁移必须保留该用户的管理员能力，但不得把用户名写死在代码或配置中。管理员身份始终由数据库中的实时权限决定。

现有用户密码使用随机 salt 加 SHA-256 保存。该算法不适合作为长期密码存储方案。现有会话 token 保存在 `localStorage`，一旦页面发生 XSS，管理员凭据会直接暴露。

## 目标

- 删除所有共享后台口令入口和 `ADMIN_PASSWORD` 配置。
- 让站内用户账号成为唯一身份来源。
- 让后台、记账、图床、文件管理和内容管理统一要求管理员权限。
- 将全部用户会话迁移为数据库支持的 opaque HttpOnly Cookie session。
- 将旧密码 hash 在成功登录时平滑升级为 `scrypt`。
- 保证权限变更、退出和删除账号能够立即撤销会话。
- 防止最后一个管理员被删除或降权。

## 非目标

- 不引入 GitHub OAuth、OIDC、JWT 或反向代理身份系统。
- 不改变文件分享链接的 capability token。该 token 是用户主动生成的资源访问能力，不是后台共享口令。
- 不实现 MFA、密码找回或全设备退出界面。
- 不改变文章、文件、图片、记账和评论的业务数据模型。

## 方案选择

采用数据库支持的 opaque session Cookie。

服务端签发高熵随机 token，浏览器只通过 HttpOnly Cookie 持有原始 token，数据库只保存 token 的 SHA-256 摘要。每次鉴权都通过 session 关联用户并读取实时 `permission`。该方案能够立即撤销 session，也能让权限变更立即生效。

不采用 JWT。当前为单实例 VPS 应用，JWT 不能减少有意义的基础设施成本，却会增加角色变更、吊销和退出的复杂度。

不采用二次提权 session。管理员使用站内账号登录后即可访问管理功能，不需要进入后台时再次输入密码。

## 服务端架构

### 唯一身份与会话存储

`users` 和 `user_sessions` 成为唯一身份与会话数据源。`user_sessions` 保存：

- `token_hash`
- `user_id`
- `created_at`
- `expires_at`

管理员和普通用户 session 都采用 30 天绝对有效期，不做滑动续期。每次成功登录签发新的随机 session。过期、未知或格式错误的 Cookie 一律视为未登录。

### 鉴权中间件

统一提供三个边界：

- `getCurrentUser`：解析 Cookie，校验 session，并返回实时用户；
- `requireUser`：要求存在有效用户；
- `requireAdmin`：要求有效用户的 `permission === 'admin'`。

未登录返回 `401 Unauthorized`。已登录但权限不足返回 `403 Forbidden`。中间件将当前用户写入请求上下文，管理操作使用真实用户 ID 作为 `editorUserId`，不再写固定字符串 `admin`。

### 权限覆盖

以下能力统一使用 `requireAdmin`：

- 文章创建、更新、删除、草稿、预览、定时发布和版本管理；
- 用户列表、创建、修改权限和删除；
- About 管理；
- 图片上传、列表和删除；
- 文件与文件夹管理、上传、删除和分享链接创建；
- 全部记账数据、分类和设置接口。

评论创建、修改和删除继续使用用户身份与现有所有权规则。公开文章、公开 About 数据、RSS、站点地图和有效的文件分享链接不要求管理员身份。

## HTTP API

### 用户会话 API

- `POST /api/users/register`：创建普通用户并设置 session Cookie，响应只返回用户信息和过期时间。
- `POST /api/users/login`：校验账号密码并设置 session Cookie，响应不包含 token。
- `GET /api/users/me`：返回当前用户和 session 过期时间。
- `POST /api/users/logout`：删除当前 session 并清除 Cookie。

删除以下共享口令 API：

- `POST /api/admin/login`
- `GET /api/admin/session`
- `POST /api/accounting/login`
- `GET /api/accounting/session`

旧接口删除后返回正常的 API `404`，不得保留能够用 `ADMIN_PASSWORD` 恢复访问的兼容分支。

### Cookie 属性

生产环境 Cookie 名为 `__Host-kitepop_session`，属性为：

- `Secure`
- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- `Max-Age=2592000`
- 不设置 `Domain`

本地 HTTP 开发使用单独的开发 Cookie 名，避免错误使用要求 `Secure` 的 `__Host-` 前缀。前端不读取 Cookie，也不接触 session token。

## CSRF 防护

生产环境必须配置唯一的 `SITE_URL`。所有 `POST`、`PUT`、`PATCH` 和 `DELETE` API 请求都校验 `Origin` 与 `SITE_URL` 完全一致。生产环境中缺失或不匹配的 `Origin` 返回 `403`。

该校验与 `SameSite=Lax`、同源 CSP 和未启用 CORS 共同构成 CSRF 防护。公开注册和登录同样执行 Origin 校验，避免 login CSRF。GET 路由不得产生业务状态变化。

## 密码迁移

新密码使用 Node.js 异步 `scrypt`。持久化格式包含算法版本、参数、salt 和派生值，使后续参数升级可识别。比较派生值时使用 constant-time 比较。

登录时按 hash 格式选择校验器：

1. 新格式使用 `scrypt` 校验。
2. 旧 `salt:sha256` 格式先按旧算法校验。
3. 旧格式校验成功后，在同次登录中生成并保存新的 `scrypt` hash。
4. 旧格式校验失败时不修改数据。

新注册用户和管理员创建的用户直接保存 `scrypt` hash。登录失败统一返回“用户名或密码错误”，不得暴露账号是否存在或 hash 类型。

## 登录限速与安全日志

单实例 VPS 使用进程内限速器。以规范化用户名和可信来源 IP 的组合为键，15 分钟内允许 5 次失败。超限返回 `429 Too Many Requests` 和 `Retry-After`。成功登录后清除对应失败计数。

来源 IP 只在应用明确配置为信任本机 Nginx 代理时读取转发头，避免客户端伪造限速键。

记录以下安全事件：

- 登录成功、失败和限速；
- 退出；
- 用户权限变更和用户删除；
- 被拒绝的后台访问。

日志只包含时间、结果、用户 ID 或规范化用户名、可信来源 IP 和事件类型，不记录密码、原始 Cookie、session token 或 password hash。

## 前端流程

应用启动只调用 `/api/users/me` 恢复用户身份。`AppContext` 只保存当前用户和会话状态，不保存 token。

所有旧 `Authorization: Bearer` 请求改为同源 Cookie 请求。前端删除 `kitepop-admin-session`、`kitepop-user-session` 和 `kitepop-accounting-session` 的读写逻辑，并在新版本首次加载时清理这三个旧键。

访问后台、记账、图床或文件管理时：

- 未登录：显示统一的站内账号登录表单，字段为用户名和密码；
- 普通用户：显示权限不足状态，不请求管理数据；
- 管理员：直接加载目标功能，不重复登录。

API 返回 `401` 时清空前端用户状态并回到登录状态。`403` 只显示权限不足，不清除仍然有效的普通用户身份。

## 管理员安全约束

服务端在同一数据库事务中检查并执行管理员删除或降权。若操作会使管理员数量变为零，则返回 `409 Conflict`，不修改用户，不撤销现有 session。

当用户权限发生变化时，撤销该用户的全部 session。被提升的用户必须重新登录后才能获得管理员权限；被降权的用户立即失去后台访问。删除用户时先撤销其全部 session，再删除用户。

线上现有的唯一管理员按 `permission = 'admin'` 自动识别。迁移逻辑不依赖其用户名。部署前使用线上数据库只读查询确认恰好存在一个管理员；若数量不是一，迁移停止并报告，不自动选择或创建管理员。

## 数据库迁移与部署

部署前停止应用并备份实际 `POST_DB_PATH` 指向的 SQLite 文件，记录 SHA-256。前后端作为一个版本整体部署。

首次启动迁移在事务中执行：

1. 确认 `users` 表中恰好存在一个管理员。
2. 清空 `user_sessions`，强制所有设备重新登录。
3. 删除 `admin_sessions` 和 `accounting_sessions`。
4. 记录迁移版本，保证迁移只执行一次。

迁移不预先改写任何密码 hash。线上管理员首次用原账号密码登录时完成惰性 `scrypt` 升级。

删除 `.env` 中的 `ADMIN_PASSWORD`，并为生产环境配置 `SITE_URL`、Cookie 安全模式和本机反向代理信任设置。部署期间先保持管理写操作不可用，完成登录与权限验收后再恢复正常使用。

若验收失败，停止新服务，同时恢复旧应用版本和部署前数据库快照。由于新旧密码格式和 session 合约不同，不支持只回滚应用而继续使用迁移后的数据库。

## 缓存与响应

所有用户身份响应、后台页面数据、草稿、预览、文件管理、图床和记账 API 使用 `Cache-Control: private, no-store`。公开内容继续使用现有公开缓存策略。

API 不回显 token、Cookie、hash、数据库路径或内部鉴权错误。错误语义统一为：

- `400`：请求格式或字段错误；
- `401`：未登录、session 无效或登录凭据错误；
- `403`：身份有效但权限不足，或 Origin 校验失败；
- `409`：操作会删除或降权最后一个管理员；
- `429`：登录失败次数超限。

## 自动化测试

### 存储与密码

- 旧 SHA-256 用户成功登录后升级为 `scrypt`。
- 错误密码不升级 hash。
- 新注册和新建用户直接保存 `scrypt`。
- session 签发、30 天过期、当前 session 退出和全用户 session 撤销正确。

### 鉴权与路由

- 无 Cookie 返回 `401`，普通用户返回 `403`，管理员通过。
- 权限矩阵覆盖文章、草稿、版本、用户、About、图床、文件、文件夹和记账接口。
- 权限变更立即撤销目标用户全部 session。
- 最后一个管理员不能删除或降权；存在第二个管理员时允许正常操作。
- 旧后台和记账登录接口为 `404`，配置 `ADMIN_PASSWORD` 也不能恢复访问。

### Cookie、CSRF 与限速

- 登录响应不含 token，生产 `Set-Cookie` 属性完整。
- 合法同源写请求通过，跨源与生产环境缺失 Origin 的写请求被拒绝。
- 第六次连续失败进入限速，响应包含 `Retry-After`，成功登录清除计数。
- 退出后重放原 Cookie 返回 `401`。

### 前端

- 启动时通过 `/api/users/me` 恢复身份。
- 未登录、普通用户和管理员三种管理页面状态正确。
- `401` 和 `403` 使用不同处理逻辑。
- 请求不再发送 Bearer token，也不再创建三个旧 `localStorage` session。
- 管理员可在后台、记账、图床和文件管理间直接切换。

## VPS 验收

1. 查询线上数据库并确认恰好一个管理员。
2. 备份数据库并记录 SHA-256。
3. 构建、迁移并启动新版本，确认迁移只运行一次。
4. 使用现有管理员账号登录，检查 Cookie 安全属性。
5. 验证后台、记账、图床、文件管理和文章编辑。
6. 使用普通用户访问全部管理接口，确认返回 `403`。
7. 重放旧后台口令、旧管理员 Bearer token 和旧用户 Bearer token，确认均不能访问。
8. 退出后重放原 Cookie，确认返回 `401`。
9. 检查安全日志不包含密码、token、Cookie 或 hash。
