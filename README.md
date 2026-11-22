# 暗王 · Shadow King

**对面把一枚棋子送到你面前。你敢吃吗？**

有可能是露了破绽的王，也可能是故意送上门的第三枚死士。经典模式里，你吃下对方最后一枚死士，赢的是对方。

[**打开浏览器，下一局暗王**](https://suducat.github.io/shadow-king/)

## 棋怎么下

两边在 7×7 的棋盘上秘密摆好 **1 王、3 影卫、3 死士**，红方先走。每回合上下左右走一格，走进敌方所在的格子就能吃子。棋子被吃时，身份才会揭晓。吃掉对方的王，或吃光对方的三枚影卫，都能赢。

你可以让王跟着队伍往前走，也可以用死士堵住对手的路。对手看得见你走过的每一步，只能从这些走法里猜，哪枚棋子值得你冒险去救。

| 模式 | 三枚死士都被对手吃掉以后 |
| --- | --- |
| **经典** | 你立刻赢。对手每吃一枚死士，下一次下手就得更小心。 |
| **祭典** | 你的王公开身份。把王送进棋盘中央的 3×3 祭台，守过对手一轮回应，就能赢。 |

祭典里，影卫还可以亮明身份蓄力，下回合向前斩杀，一次扫过最多两格。每枚影卫整局只有一次机会。付出暴露身份的代价，可以为王清路，也可以提前封住对面王的去路。

普通落子、吃子和双目标斩杀都有各自的 3D 动作。吃子时，等武器命中才会翻开对面的身份。[看实际对局动作](https://suducat.github.io/shadow-king/review/motion/)

## 找谁下

- **和朋友远程下** · 选同一种规则，在「王庭邀约」里发起对局，把六位密令发给朋友。朋友应邀后，游戏会给双方秘密随机布阵。
- **共用一台设备** · 选本地双人，每回合通过隐私交接换手。
- **自己练棋** · 棋侍、影谋、诡相、无冕者这四档 AI 都和你一样，只能根据公开信息猜对手。想打逆风局，可以选「全知者 · 帷幕之外」：它看得到你的全部身份，你仍要自己猜它的棋。

## 本地运行

需要 Node.js 20.19+ 或 22.12+。

```sh
npm ci
npm run dev
```

打开终端给出的地址。运行 `npm test` 可执行单元测试，运行 `npm run build` 可生成静态部署目录 `dist/`。浏览器需要支持 WebGL 和 Web Worker。单机对局的 AI 在浏览器里计算。

## 开发资料

<details>
<summary>联机实现与浏览器测试</summary>

GitHub Pages 使用 PeerJS 公共信令及 WebRTC DataChannel，无需账号、自建游戏后端或数据库。密令用于寻找当前开着的房间。WebRTC 优先直连，并提供 Open Relay 的 TCP/TLS TURN 作为受限网络的备选路径。信令或中继不可达时，界面会说明失败阶段。建立连接或同步超时会提示退出重试，本版本没有断线续局。

每端只保存自己的真实阵容和已公开的对方身份。开局交换带随机盐的身份承诺，吃子、蓄力及王公开时验证相应凭据。双方通过现有规则独立结算，按对局 ID、阵营、回合和操作编号验证动作。经典模式的重复局面依赖真实角色分布，因此仅在公开棋位满足三次重复的候选条件时，双方交换各自匹配的历史回合编号。这会透露有限的局面相等关系。P2P 适用于休闲对局，无法阻止篡改客户端故意选用异常布局、隐瞒重复结果或中断游戏。

`npm test` 覆盖私有视图结算、身份承诺及特殊胜利。可用 `node tests/online-browser.cjs` 对两个独立 Chromium 环境和一个额外的房间占用测试环境执行联机流程。测试需要独立的 PeerServer（只用于测试）及测试构建。用 `VITE_PEER_TEST_PORT=17366 npm run build:test` 将测试信令定向本机，由 HTTP 服务器将 `dist-test` 挂载于 `http://127.0.0.1:17367/shadow-king/`。可以通过环境变量 `SK_ONLINE_BASE` 指定其他测试页面地址。可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 选择支持 WebRTC 的独立 Chromium；受管浏览器可能禁用直连测试所需的 UDP。正式构建使用 PeerJS 公共信令与 [Open Relay 公共中继](https://www.metered.ca/tools/openrelay/)。

</details>

<details>
<summary>版本记录与演出对照</summary>

### V0.8.0 稳定交互与清晰棋盘

- 桌面对局固定视口、侧栏独立滚动，避免信息变化带动整幅棋盘；修正影卫面板撑高手机页面的问题，棋盘触控不再拖动整页。
- Retina 密度独立于模型细节设置，去除棋盘 Canvas 遮罩，改善轮廓、纹理与边缘清晰度。
- 硬件渲染器合批重复角色，软件显卡使用兼容路径；选中与合法落点复用固定缓冲，保留动作、退场与身份伪装。

[同场景对照](https://suducat.github.io/shadow-king/review/v08/) · [测试与性能数据](docs/v0.8/REPORT.md)

```sh
npm run test:rendering
npm run build:test
npm run test:rendering:browser
```

### V0.7.0 战斗演出

- 新增身体、双腿、武器、披风和王冠的关节动作；底座贴地，攻击按预备、发力、命中、余势、归位推进。
- 命中后才公开目标并退场；斩杀逐个处理目标，音效、剑刃轨迹、局部冲击和短暂停顿共享时间轴。
- 蓄力、祭典开启、占领和中断分段呈现；四类结算各有高潮，支持跳过与精简动画。
- 隐藏敌方使用统一模型、动作和音色。原有规则、AI 和棋盘点击判断保持不变。

[前后实时录屏与原声](https://suducat.github.io/shadow-king/review/v07/) · [实际测试、性能与限制](docs/v0.7/REPORT.md)。云端使用软件显卡，未做 Mac 或手机真机验收。

```sh
npm test
npm run build:test
npm run test:combat:browser
npm run test:combat:background
npm run build
npm run test:combat:production
node tests/combat-production.cjs --restart
```

录像工具需 Playwright Chromium 和 ffmpeg；使用 `STAGE=before DIST=<旧版测试构建目录>` 或 `STAGE=after DIST=dist-test npm run record:combat`。逐帧与性能工具可通过 `BASELINE_DIST` 指定旧版测试构建。对照影片独立加载，不计入正式游戏首次资源请求。

### V0.6.0 改进

- 全知权限由观察边界显式授予，Worker 重新验证；不修改棋子的公开状态。原四档会丢弃误传的透视权限。
- 独立的非对称搜索：完整身份战术、全合法根行动安全检查、祭典反制证明、迭代加深、有限置换缓存、走法排序与战术延伸。模拟玩家的行动概率仅由玩家公开信息生成。
- 通常搜索预算 1.9 秒，存在吃子、斩杀或开启祭典时 4.2 秒，硬上限 5 秒。380ms 最短选子展示与200ms选中反馈另计，复杂搜索不额外人为等待。5.6 秒看门狗优先使用 Worker 已发回的合法战术回退。
- 黑曜石、石灰岩、旧金、铠甲、织物采用不同粗糙度与原创程序纹理；暖主光与冷轮廓光提高正常视角识别度。
- 设置中提供高／中／低画质；默认桌面中档、触控或低核心设备低档，尊重系统减少动态效果。低档保留全部关键状态提示。
- 棋盘实例化、字符图集和环境合批降低绘制开销；画质变更在战斗完成后替换角色资源，保留原模型、动作与身份伪装。

实测数据、限制、画质说明与前后截图见 [V0.6 验证报告](docs/v0.6/REPORT.md)。此挑战以高获胜能力为目标，不声称不可战胜。

### V0.5.1 改进

- 在全部合法身份后验中验证关键祭典占领与反制，保留优先弑王、肃清的反胜机会。
- 风险评估区分猜中暗王的收益和不可逆的失败，降低无条件接受献祭诱饵的倾向。
- 搜索与证明均有预算，重新开始、返回菜单和终局会取消旧的 AI 任务。
- 高亮合法落点优先响应，避免透视下相邻高模型遮挡目标格。
- 保留原有3D模型、移动、吃子、揭示、三种结算演出及声音。

</details>

<details>
<summary>测试命令、源码与授权</summary>

### 测试

```sh
npm test
npx tsx scripts/ai-v05-tactics.ts
npm run build:test
npx playwright install chromium
node tests/ai-controller.cjs
npm run test:omniscient
npm run test:v06:browser
node tests/v06-render.cjs
npm run build
node tests/ritual-production.cjs
node tests/production.cjs
```

浏览器检查使用 Playwright。CI 自动执行单元测试和构建。测试模式提供开发夹具；正式构建不包含测试控制接口。

源码包括规则、交互、模型生命周期、动画及AI回归检查。算法是有预算的身份采样与回应搜索，仍有长程规划和僵持限制，不代表已达到某个人类棋力等级。

固定种子、真实浏览器 Worker 预算的对战工具：

```sh
npm run build:test
TAG=experiment SEEDS=2 JOBS=2 npm run test:v06:arena
```

会运行经典／祭典、交换红蓝先后手、对当前大师／死士前压／守王基线的全部配对对局。保留所有胜负和平局，不会挑选种子。原始输出位于 `artifacts/v06/experiment/arena.json`；复现发布测试使用报告中的源版本和种子。软件显卡上请顺序运行视觉检查，避免同时开启多个 WebGL 实例。

### 结构

- `src/game.ts` / `ritual.ts`：正式规则与胜负判定。
- `src/ai.ts` / `belief.ts` / `strategic-ai.ts` / `omniscient-ai.ts` / `rite-proof.ts`：观察隔离、身份概率、搜索与祭典反制验证。
- `src/scene.ts` / `models.ts` / `battle-*`：3D场景、角色与演出。
- `src/App.tsx` / `BoardHUD.tsx` / `RitualUI.tsx`：正式游戏界面。
- `tests/`：规则与交互回归；其中夹具为程序化测试局面。

角色、石材纹理、符文与声音使用原创程序化实现。图标、字体及运行依赖的授权信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 `public/` 中的授权文件。

</details>
