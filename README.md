# 暗王 · SHADOW KING — V0.8.1

双人奇幻隐藏身份策略棋，使用 React、TypeScript、Three.js、Vite 与 Web Audio。完整游戏在浏览器本地运行，支持本地双人、王庭邀约联机、四档公平 AI、全知者透视挑战、经典模式和祭典模式。

此仓库是正式游戏发行版，已整合复盘后的风险评估、完整祭典回应验证与合法格点击修复。无需后端、数据库、模型 API 或访问令牌。

普通落子、普通吃子和双目标斩杀的同机位录屏与帧号见[动作对照](https://suducat.github.io/shadow-king/review/motion/)。

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

本地双人使用隐私交接；人机对战由玩家执红，AI执蓝。四档公平难度为棋侍、影谋、诡相、无冕者，只接收自身身份与公开对局信息。第五档「全知者 · 帷幕之外」是玩家主动选择的透视挑战：它能够看见玩家全部真实身份，玩家仍看不见 AI 未公开身份。选择页有醒目告知和独立开始按钮，对局顶部持续标示。全部搜索在本地 Worker 中进行，不需要联网。

## 王庭邀约

两位玩家选相同规则后，在「王庭邀约」中分别发起和应邀。密令为六位数字，房主执红，访客执蓝。双方就位后秘密随机布阵并直接开局。断线或刷新会暂停对手的棋局，可从「离开王庭」退出，并重新发起邀约。

GitHub Pages 使用 PeerJS 公共信令及 WebRTC DataChannel，无需账号、自建游戏后端或数据库。密令用于寻找当前开着的房间。信令和部分网络可能不可用，跨 NAT 的网络可能需要 TURN。建立连接或同步超时会提示退出重试，本版本没有断线续局。

每端只保存自己的真实阵容和已公开的对方身份。开局交换带随机盐的身份承诺，吃子、蓄力及王公开时验证相应凭据。双方通过现有规则独立结算，按对局 ID、阵营、回合和操作编号验证动作。经典模式的重复局面依赖真实角色分布，因此仅在公开棋位满足三次重复的候选条件时，双方交换各自匹配的历史回合编号。这会透露有限的局面相等关系。P2P 适用于休闲对局，无法阻止篡改客户端故意选用异常布局、隐瞒重复结果或中断游戏。

`npm test` 覆盖私有视图结算、身份承诺及特殊胜利。可用 `node tests/online-browser.cjs` 对两个独立 Chromium 环境和一个额外的房间占用测试环境执行联机流程。测试需要独立的 PeerServer（只用于测试）及测试构建。用 `VITE_PEER_TEST_PORT=17366 npm run build:test` 将测试信令定向本机，由 HTTP 服务器将 `dist-test` 挂载于 `http://127.0.0.1:17367/shadow-king/`。可以通过环境变量 `SK_ONLINE_BASE` 指定其他测试页面地址。可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 选择支持 WebRTC 的独立 Chromium；受管浏览器可能禁用直连测试所需的 UDP。正式构建使用 PeerJS 默认公共服务。


## V0.8.0 稳定交互与清晰棋盘

- 桌面对局固定视口、侧栏独立滚动，避免信息变化带动整幅棋盘；修正影卫面板撑高手机页面的问题，棋盘触控不再拖动整页。
- Retina 密度独立于模型细节设置，去除棋盘 Canvas 遮罩，改善轮廓、纹理与边缘清晰度。
- 硬件渲染器合批重复角色，软件显卡使用兼容路径；选中与合法落点复用固定缓冲，保留动作、退场与身份伪装。

[同场景对照](https://suducat.github.io/shadow-king/review/v08/) · [测试与性能数据](docs/v0.8/REPORT.md)

```sh
npm run test:rendering
npm run build:test
npm run test:rendering:browser
```

## V0.7.0 战斗演出

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

## V0.6.0 改进

- 全知权限由观察边界显式授予，Worker 重新验证；不修改棋子的公开状态。原四档会丢弃误传的透视权限。
- 独立的非对称搜索：完整身份战术、全合法根行动安全检查、祭典反制证明、迭代加深、有限置换缓存、走法排序与战术延伸。模拟玩家的行动概率仅由玩家公开信息生成。
- 通常搜索预算 1.9 秒，存在吃子、斩杀或开启祭典时 4.2 秒，硬上限 5 秒。380ms 最短选子展示与200ms选中反馈另计，复杂搜索不额外人为等待。5.6 秒看门狗优先使用 Worker 已发回的合法战术回退。
- 黑曜石、石灰岩、旧金、铠甲、织物采用不同粗糙度与原创程序纹理；暖主光与冷轮廓光提高正常视角识别度。
- 设置中提供高／中／低画质；默认桌面中档、触控或低核心设备低档，尊重系统减少动态效果。低档保留全部关键状态提示。
- 棋盘实例化、字符图集和环境合批降低绘制开销；画质变更在战斗完成后替换角色资源，保留原模型、动作与身份伪装。

实测数据、限制、画质说明与前后截图见 [V0.6 验证报告](docs/v0.6/REPORT.md)。此挑战以高获胜能力为目标，不声称不可战胜。

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

## 结构

- `src/game.ts` / `ritual.ts`：正式规则与胜负判定。
- `src/ai.ts` / `belief.ts` / `strategic-ai.ts` / `omniscient-ai.ts` / `rite-proof.ts`：观察隔离、身份概率、搜索与祭典反制验证。
- `src/scene.ts` / `models.ts` / `battle-*`：3D场景、角色与演出。
- `src/App.tsx` / `BoardHUD.tsx` / `RitualUI.tsx`：正式游戏界面。
- `tests/`：规则与交互回归；其中夹具为程序化测试局面。

角色、石材纹理、符文与声音使用原创程序化实现。图标、字体及运行依赖的授权信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 `public/` 中的授权文件。
