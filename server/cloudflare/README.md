# 王庭邀约联机服务

GitHub Pages 提供静态前端。Cloudflare Worker 接受房间请求并把 WebSocket 交给对应密令的 Durable Object。每个密令映射到独立实例，实例在同一个串行存储操作中拒绝占用的密令或保留访客席位。

## 本地运行

使用 Node.js 22 或更新版本，在仓库根目录运行：

```sh
npm ci
npm run dev:multiplayer -- --local --port 8787 --var ALLOWED_ORIGINS:http://127.0.0.1:5173
```

在另一个终端启动前端：

```sh
VITE_MULTIPLAYER_URL=http://127.0.0.1:8787 npm run dev
```

打开 `http://127.0.0.1:5173/`，使用两个浏览器会话发起邀约。若开发服务器用了其他端口，启动 Worker 时同步修改允许的来源。

```sh
npm run typecheck:multiplayer
npm run test:multiplayer
npm test
npm run build
```

联机集成测试会自行启动本地 Wrangler Worker。它验证 WebSocket、席位并发、真实存储和闹钟，并重启 Worker 后用原凭证恢复棋局。运行双浏览器界面测试时，用 `VITE_MULTIPLAYER_URL=http://127.0.0.1:8787 npm run build:test` 生成 `dist-test`，用静态服务器提供该目录，再运行 `SK_ONLINE_BASE=http://127.0.0.1:5173/ node tests/online-browser.cjs`。Worker 的允许来源须与静态服务器一致。

## 正式部署

1. 在仓库根目录登录自己的 Cloudflare 账号，再部署 Worker。

   ```sh
   npx wrangler login
   npm run deploy:multiplayer
   ```

2. GitHub Pages 工作流已配置正式 Worker 地址。换用其他 Worker 时，可将新的 HTTPS 根地址设为 GitHub 仓库 `suducat/shadow-king` 的 Actions 变量 `VITE_MULTIPLAYER_URL`。可以用 GitHub 网页的 **Settings → Secrets and variables → Actions → Variables**，或运行：

   ```sh
   gh variable set VITE_MULTIPLAYER_URL --repo suducat/shadow-king --body 'https://shadow-king-multiplayer.<你的子域>.workers.dev'
   ```

3. 合并迁移分支，现有 Pages 工作流会先检查 Worker 的 `/health`，再构建并部署。已合并时可以在 Actions 手动运行 **Deploy GitHub Pages**。发布后从 Pages 用两台设备验证一局。

`ALLOWED_ORIGINS` 默认只允许 `https://suducat.github.io`。自定义域名应加入这一列表。前端配置只包含公开地址，不包含 Cloudflare 凭据。Cloudflare 登录或自动化用的账号 Token 只用在部署端。

## 协议与限制

- `POST /v1/rooms` 创建房间，`POST /v1/rooms/{code}/join` 预留蓝方席位。两者接受 `{"version":1,"rule":"classic"}` 或祭典规则 `ritual`。席位凭证为随机 256 位值，经 WebSocket 子协议提交。凭证不会进入 URL 或应用日志。
- `GET /v1/rooms/{code}/socket` 升级 WebSocket。房间使用可休眠的 WebSocket API，心跳由运行时自动回应。断线后客户端按带抖动的指数退避重试，同一席位只保留一个连接。凭证保存在当前页面内存。彻底刷新或关闭标签页会丢失该凭证。
- Worker 用游戏本身的规则引擎核对走法、祭典、胜负和重复局面。每席位保留最近一次确认用于幂等重试，更早操作由过期回合或对局 ID 拒绝。快照只包含本方和已公开棋子的身份。
- 闲置 30 分钟清理房间；尚未连接的蓝方席位预留 45 秒。生产采用可休眠 WebSocket 和 SQLite Durable Object，符合 [Workers Free 的 SQLite 要求与配额](https://developers.cloudflare.com/durable-objects/platform/pricing/)。免费配额用尽时 Cloudflare 会拒绝相应操作。
- 房间限制两席。创建、加入和重连按来源 IP 限频，游戏帧按连接限频且最大 4 KiB。六位密令用于找房，知道密令的人可以占用空席。已占席位需要独立的随机凭证。
