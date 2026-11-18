const fs=require('fs'),cp=require('child_process');const read=f=>JSON.parse(fs.readFileSync(f));const folder='docs/v0.8',review='public/review/v08';fs.mkdirSync(folder,{recursive:true});fs.mkdirSync(review,{recursive:true});
const before=read('artifacts/v08-before.json'),after=read('artifacts/v08-after.json'),stable=read('artifacts/v08-rendering-browser.json'),perf=read('artifacts/v08-performance.json'),core=read('artifacts/v07/checks/renderer.json'),unit=fs.readFileSync(process.env.UNIT_LOG||'/tmp/sk-v08-adaptive-unit.log','utf8');
const classic=read('artifacts/v07-production-classic.json'),ritual=read('artifacts/v07-production-ritual.json'),restart=read('artifacts/v07-production-classic-restart.json'),background=read('artifacts/v07/checks/background.json');for(const r of[stable,classic,ritual,restart,background])if(!r.passed)throw Error('Missing passing validation');if(core.failures.length||!unit.includes('ℹ fail 0')||perf.rows.some(r=>r.errors.length))throw Error('Regression failed');
const data={'before.json':before,'after.json':after,'stability.json':stable,'performance.json':perf,'combat.json':core,'classic.json':classic,'ritual.json':ritual,'restart.json':restart,'background.json':background,'unit.json':{tests:+unit.match(/ℹ tests (\d+)/)[1],pass:+unit.match(/ℹ pass (\d+)/)[1],fail:0}};for(const[name,r]of Object.entries(data))fs.writeFileSync(`${folder}/${name}`,JSON.stringify(r,null,2));
for(const stage of['before','after'])for(const width of[1440,390])cp.execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',`artifacts/v08-${stage}-${width}.png`,'-c:v','libwebp','-lossless','1',`${review}/${stage}-${width}.webp`]);
const median=a=>a.slice().sort((a,b)=>a-b)[1],rows=perf.rows.map(r=>`| ${r.stage} / ${r.mode} | ${r.samples.map(s=>s.fps.toFixed(2)).join(' / ')} | ${median(r.samples.map(s=>s.fps)).toFixed(2)} | ${r.samples[0].calls} | ${r.samples[0].triangles} |`).join('\n');
fs.writeFileSync(`${folder}/REPORT.md`,`# V0.8 · 稳定交互、清晰棋盘与绘制优化

[正式游戏](https://suducat.github.io/shadow-king/) · [同场景原始像素对照](https://suducat.github.io/shadow-king/review/v08/)

## 实际定位

- 手机祭典界面中，选择影卫会命中旧的 :has(.guard-controls) 样式，给选中卡片加 230px 下边距。实测页面从 1168px 长到 1398px，移动取消选择后又缩回，可能触发滚动锚定与整页位移。已去掉这个不再适用于悬浮技能面板的占位；棋盘区域的触控不再启动浏览器拖页，区域外仍可正常滚动。
- 默认中画质把 Retina 屏幕限制为 1.25×，实测桌面 900×610 CSS 像素的棋盘仅有 1125×762 绘图缓冲，手机仅 487×512，再放大到 2× 屏幕。棋盘还应用了整张 Canvas 的 CSS mask。现在中档在这些场景使用原生 2×：桌面 1800×1220、手机 780×819；移除画布遮罩，边缘淡出改为不参与命中的普通 CSS 覆盖层。
- 本次桌面采样中，普通选中和移动没有发现相机坐标变化。可确认的另一个问题是渲染压力：重复角色每个部件单独提交，普通选择还反复创建／销毁高亮资源。在同等分辨率下做了前后性能采样，不把所有卡顿都归因于镜头。

## 具体修改

- src/render-resolution.ts、src/quality.ts：把曲面细节与显示密度分开。低／中上限 2×，高上限 3×，物理像素预算分别 120／250／400 万；不会按当前 FPS 在点击过程中临时缩放画面。桌面不再仅凭 CPU 核心数就强制低画质。
- src/scene.ts：用真实 CSS 矩形计算画布和相机；尺寸／密度未变就不重建缓冲，一次 setDrawingBufferSize 完成调整。选择和移动不再额外即时渲染尚未更新镜头的一帧。待机限制为低15／中24／高30 FPS，实际移动、镜头操作和战斗仍按浏览器 RAF 更新。
- src/rigid-batches.ts：把相同不透明部件以 InstancedMesh 合并提交，使用每枚棋子各关节的世界矩阵，保留动作与模型层级。被吃棋子单独绘制退场。材质按完整签名分组；不共享可变的退场材质，不借隐藏身份分组。复用实例缓冲，清理时恢复源网格层并释放实例资源。SwiftShader／llvmpipe 等已知软件显卡默认使用普通绘制，避免实测较慢的实例变换；硬件显卡走合批路径，真机FPS尚未验证。
- src/models.ts：合并后重新索引完全相同的位置、法线和UV，保留纹理接缝及硬边，将测试棋局的角色顶点从594941降至162950（约72.6%），三角形不变。
- src/board-marks.ts：选中、合法落点、攻击环、方向叉使用固定缓冲与形状，100 次切换不重建几何体。点击检测继续只使用原来的棋子碰撞体和棋盘平面。
- src/surfaces.ts：石材与织物使用受限各向异性过滤，降低倾斜视角的纹理闪烁。祭典动态光只在祭典模式注册，开启时不改变光源数量来触发全场材质程序变化。
- src/render.css：清除导致跳页的旧占位，移除棋盘 Canvas mask 和技能面板背后模糊；面板采用清晰的深色背景。

没有改规则引擎、AI 决策、吃子顺序、斩杀落点和隐藏身份规则；没有通过延长动作掩盖掉帧。

## 已执行验证

- 单元测试 ${data['unit.json'].pass}/${data['unit.json'].tests}，涵盖原规则、AI、时间轴，以及新增像素预算、部件矩阵、材质分组、可见性、资源所有权与100次高亮复用。
- 1440×900 与390×844、DPR2：真实鼠标／touchscreen.tap 选择和移动。页面高度、棋盘投影、相机位置和缓冲重建计数在行动中不变；画布达到原生2×，遮罩为 none。见 [数据](stability.json)。
- 战斗 ${core.checks} 项检查、${core.actions} 次动作，失败0；连续移动／吃子／斩杀、跳过、不同时间步与重开回归通过。原压力套件包括108移动、30吃子、33跳过、27场景重开；另一套216移动、42吃子、9中断通过。
- 经典和祭典正式构建各完成一场8步弑王对局；动作跳过、结算跳过、认输后再来一局及重新布阵通过。浏览器冻结2300ms后，双目标斩杀仍只增加一步、两次吃子和两次命中，过期命中音0。
- npm run build 成功；保留已有的入口包体偏大提示。开发 QA 工具没有进入正式构建。

## 性能实测

环境：云端 Linux、Chromium、SwiftShader 软件显卡。${perf.device}。下表在同样的低于1×测试 DPR下运行，以隔离画质提高带来的像素负载；预热3个已渲染帧后再做三段各约3秒采样，不能当作 Mac 或手机真机表现。

| 版本／模式 | 三段 FPS | 中位 FPS | draw calls | 三角形 |
|---|---:|---:|---:|---:|
${rows}

强制合批路径的验证中，经典调用339→176、祭典458→295，但该软件显卡并未提帧，因此软件设备的默认路径没有启用角色合批。硬件合批的实际FPS收益待真机确认。2×清晰度测试中，绘图缓冲像素增加约2.56倍，画面更清晰也有真实的像素成本。本次能够确认的是布局稳定、清晰度提高、顶点／资源复用及合批路径的绘制调用减少；不宣称已在云端或全部硬件实现提帧。原始对照采用同一局面、镜头和画质，图片使用无损 WebP。

## 限制

尚未在 Mac、Safari 或手机真机上验收，也没有宣称锁定60 FPS。软件显卡仍可能低帧率；高画质3×和阴影开销更高。保留高／中／低画质与精简动画设置。
`);
for(const name of ['v08-performance-before-indexing.json','v08-forced-batching-warm.json'])if(fs.existsSync(`artifacts/${name}`))fs.copyFileSync(`artifacts/${name}`,`${folder}/${name}`);
fs.appendFileSync(`${folder}/REPORT.md`,'\n保留中间实验：仅合批阶段和强制合批／索引阶段的原始负面采样也在本目录，未排除较慢样本。最终表格使用默认设备路径。\n');
fs.writeFileSync(`${review}/index.html`,`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>暗王 V0.8 清晰度与交互对照</title><style>body{margin:24px auto;padding:0 20px;max-width:1400px;background:#0b1319;color:#ded2bc;font:16px/1.7 system-ui}a{color:#d1b77c}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}img{width:100%;height:auto;border:1px solid #5e5135}h1{color:#dcc38b}p{max-width:1050px}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>暗王 V0.8 · 稳定、清晰的棋盘</h1><p>各组使用相同局面、视口与中画质；前两组DPR2，矮桌面组DPR1。原版来自 df2228a，新版为V0.8。图片无损保存；点击可查看原始像素。云端软件显卡截图，不代表真机帧率。</p><p><a href="../../">正式游戏</a> · <a href="https://github.com/suducat/shadow-king/blob/main/docs/v0.8/REPORT.md">测试与性能报告</a></p>${[1440,390].map(width=>`<h2>${width===1440?'桌面1440×900':'手机390×844'}</h2><div class="pair">${['before','after'].map(stage=>`<div><h3>${stage==='before'?'修改前':'修改后'}</h3><a href="${stage}-${width}.webp"><img loading="lazy" src="${stage}-${width}.webp" alt="${stage==='before'?'修改前':'修改后'} ${width}像素视口的同一棋局"></a></div>`).join('')}</div>`).join('')}<p>手机旧版选中时页面额外增高230px；新版实测选中和移动时页面高度、镜头投影与画布大小保持一致。原生2×绘制改善边缘，高亮资源复用与角色合批减少绘制压力。</p></html>`);console.log(`${folder}/REPORT.md`);

if(fs.existsSync('artifacts/v08/live/live.json')){const live=read('artifacts/v08/live/live.json');if(!live.complete||live.errors.length||live.failed.length)throw Error('Live verification failed');fs.copyFileSync('artifacts/v08/live/live.json',`${folder}/live.json`);fs.appendFileSync(`${folder}/REPORT.md`,'\n## 上线确认\n\nGitHub Pages 已构建并部署成功：[流水线](https://github.com/suducat/shadow-king/actions/runs/44238022494)。线上浏览器实际完成玩家移动和AI回合，桌面与390px视口无横向溢出，对照页无损图正常，未发现运行错误或资源失败。见 [线上记录](live.json)。线上流程检查使用精简动画；清晰度与动作验证来自前述独立测试。\n\n云端浏览器经过代理，采用测试上下文证书例外；默认TLS校验的curl也验证通过，图片返回200与image/webp。正式页面未引入证书绕过。\n');}
if(fs.existsSync('artifacts/v08-short-after.json')){
 for(const stage of['before','after']){fs.copyFileSync(`artifacts/v08-short-${stage}.json`,`${folder}/short-${stage}.json`);cp.execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',`artifacts/v08-short-${stage}-1440.png`,'-c:v','libwebp','-lossless','1',`${review}/short-${stage}.webp`]);}
 let md=fs.readFileSync(`${folder}/REPORT.md`,'utf8');md=md.replace('## 实际定位\n','## 实际定位\n\n- **矮桌面窗口的整幅抽动根因**：1440×700 下，侧栏内容撑高整个对局，移动后页面从863px缩到805px，棋盘画布高度从573.17px变到515.17px，参考格投影向上偏移约14.59px。现在桌面对局固定在视口高度，侧栏独立滚动，选中、移动和交接均保持页面700px、画布410px，投影与缓冲重建计数不变。原始记录见 [修改前](short-before.json)／[修改后](short-after.json)。\n');
 md=md.replace('本次桌面采样中，普通选中和移动没有发现相机坐标变化。','900px高窗口的普通点击没有发现相机位置变化；补测700px高窗口则确认了容器重排引起的投影变化。');md=md.replace('1440×900 与390×844、DPR2','1440×900、1440×700 与390×844、DPR2');md=md.replace('src/render.css：清除导致跳页的旧占位','src/render.css：桌面固定视口、侧栏独立滚动；清除导致跳页的旧占位');
 fs.writeFileSync(`${folder}/REPORT.md`,md);let html=fs.readFileSync(`${review}/index.html`,'utf8');html=html.replace('</html>',`<h2>矮桌面1440×700：布局抽动修复（DPR1）</h2><p>此前移动后页面缩短58px，带动整张棋盘缩放位移；新版保持视口与画布尺寸，侧栏独立滚动。</p><div class="pair">${['before','after'].map(s=>`<div><h3>${s==='before'?'修改前':'修改后'}</h3><a href="short-${s}.webp"><img loading="lazy" src="short-${s}.webp" alt="${s==='before'?'修改前':'修改后'}矮桌面布局"></a></div>`).join('')}</div></html>`);fs.writeFileSync(`${review}/index.html`,html);
}
