# 暗王 · SHADOW KING — V0.5.1

双人奇幻隐藏身份策略棋，使用 React、TypeScript、Three.js、Vite 与 Web Audio。完整游戏在浏览器本地运行，支持本地双人、四档 AI、经典模式和祭典模式。

此仓库是正式游戏发行版，已整合复盘后的风险评估、完整祭典回应验证与合法格点击修复。无需后端、数据库、模型 API 或访问令牌。

## 启动

需要 Node.js 20.19+ 或 22.12+。

```sh
npm ci
npm run dev
```

访问终端显示的本地地址。

```sh
npm test
npm run build
npm run preview
```

`dist/` 是可部署到任意静态网站服务的完整游戏。使用 HTTP/HTTPS 打开，浏览器需要允许 WebGL 和 Web Worker。声音在首次点击后启用，可在设置中静音。

## 玩法

- 7×7 棋盘，每方1王、3影卫、3死士，秘密布阵，红方先行。
- 每次上下左右移动一格，进入敌方格子即可吃子并公开被吃身份。
- 吃掉敌王或全部敌方影卫即获胜。
- 经典模式：己方三死士全部被吃立即获胜，无斩杀或中央祭台。
- 祭典模式：己方三死士全灭开启祭典，王永久公开；王占领中心3×3祭台并守过敌方回应后获胜。
- 祭典影卫需提前一回合公开蓄力，每枚整局一次斩杀，固定向前尽量移动两格；仅边界可缩短，友军阻挡时不能释放。

本地双人使用隐私交接；人机对战由玩家执红，AI执蓝。四档难度为棋侍、影谋、诡相、无冕者。AI只接收自身身份与公开对局信息，在本地 Worker 内计算。

## V0.5.1 改进

- 在全部合法身份后验中验证关键祭典占领与反制，保留优先弑王、肃清的反胜机会。
- 风险评估区分猜中暗王的收益和不可逆的失败，降低无条件接受献祭诱饵的倾向。
- 搜索与证明均有预算，重新开始、返回菜单和终局会取消旧的 AI 任务。
- 高亮合法落点优先响应，避免透视下相邻高模型遮挡目标格。
- 保留原有3D模型、移动、吃子、揭示、三种结算演出及声音。

## 测试

```sh
npm test
npx tsx scripts/ai-v05-tactics.ts
npm run build:test
npx playwright install chromium
node tests/ai-controller.cjs
npm run build
node tests/ritual-production.cjs
node tests/production.cjs
```

浏览器检查使用 Playwright。CI 自动执行单元测试和构建。测试模式提供开发夹具；正式构建不包含测试控制接口。

源码包括规则、交互、模型生命周期、动画及AI回归检查。算法是有预算的身份采样与回应搜索，仍有长程规划和僵持限制，不代表已达到某个人类棋力等级。

## 结构

- `src/game.ts` / `ritual.ts`：正式规则与胜负判定。
- `src/ai.ts` / `belief.ts` / `strategic-ai.ts` / `rite-proof.ts`：观察隔离、身份概率、搜索与祭典反制验证。
- `src/scene.ts` / `models.ts` / `battle-*`：3D场景、角色与演出。
- `src/App.tsx` / `BoardHUD.tsx` / `RitualUI.tsx`：正式游戏界面。
- `tests/`：规则与交互回归；其中夹具为程序化测试局面。

角色、石材纹理、符文与声音使用原创程序化实现。图标、字体及运行依赖的授权信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 `public/` 中的授权文件。
