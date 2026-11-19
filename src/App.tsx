import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowLeft, Volume2, VolumeX, Settings2, BookOpen, X, Shield, Crown, Sparkles, RotateCw, ZoomIn, ZoomOut, Maximize, Flag, EyeOff, ChevronRight, Check, Shuffle, Swords, Info, Monitor, Users, LockKeyhole, Eye } from 'lucide-react';
import { BoardScene } from './scene';
import { OpponentSelect } from './OpponentSelect';
import { PieceIcon } from './PieceIcon';
import { EndCinematic } from './EndCinematic';
import { CONFIG, createGame, startGame, swapSetup, legalMoves, move, act, allActions, viewFor, roleName, sideName, coord, type Game, type Side, type Role, type Capture } from './game';
import { sound } from './audio';
import {publicBeats} from './battle-timeline';
import type { FixtureName } from './qa';
import { DIFFICULTIES, deploy, observe, OMNISCIENT_NOTICE, type Difficulty, type PublicAction } from './ai';
import { useAI } from './useAI';
import {modeOf,executionPath,type GameMode,type GameAction} from './ritual';
import {RitualStatus,RitualGuide} from './RitualUI';
import {BoardHUD} from './BoardHUD';
import {QUALITY,defaultQuality,isQuality,type Quality} from './quality';
type Phase = 'menu' | 'mode' | 'difficulty' | 'setup' | 'play' | 'handoff' | 'result';
type Modal = 'rules' | 'settings' | 'credits' | 'restart' | 'resign' | 'leave' | null;
type Preferences = { music: number; effects: number; muted: boolean; cinematic: boolean; reduced: boolean;quality:Quality };
const defaultPrefs: Preferences = { music: .32, effects: .65, muted: false, cinematic: true, reduced: typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches,quality:defaultQuality() };
function readPrefs(): Preferences { try { const saved=JSON.parse(localStorage.getItem('shadow-king-settings')||'{}');return{...defaultPrefs,...saved,quality:isQuality(saved.quality)?saved.quality:defaultPrefs.quality}; } catch { return defaultPrefs; } }
const endingText = {
  king: ['王权陨落', '失去王冠之时，王国亦归于寂静。', 'REGICIDE'],
  guard: ['影卫尽灭', '最后一道防线，已归于沉寂。', 'THE FALLEN GUARD'],
  ritual: ['祭典登临', '穿越终焉，守住最后的王座。', 'RITE OF SHADOWS'],
  martyr: ['终焉之祭', '他们的消逝，正是胜利的开始。', 'THE FINAL SACRIFICE'],
  quiet: ['永夜僵局', '无人加冕，亦无人臣服。', 'ETERNAL NIGHT'],
  repetition: ['永夜僵局', '无人加冕，亦无人臣服。', 'ETERNAL NIGHT'],
  blocked: ['永夜僵局', '无人加冕，亦无人臣服。', 'ETERNAL NIGHT'],
  resign: ['王庭谢幕', '王旗垂落，今夜的命运已定。', 'THE LAST OATH'],
};
function Crest({ large = false }: { large?: boolean }) { return <div className={`crest ${large ? 'large' : ''}`}><Crown strokeWidth={1}/><span>◆</span></div>; }

export default function App() {
  const [rulesMode,setRulesMode]=useState<GameMode>('classic');
  const [chargeIntent,setChargeIntent]=useState(false);
  const revealQueue=useRef<Capture[]>([]);
  const [phase, setPhase] = useState<Phase>('menu');
  const [gameMode,setGameMode]=useState<'local'|'ai'>('local');
  const [difficulty,setDifficulty]=useState<Difficulty>('normal');
  const [history,setHistory]=useState<PublicAction[]>([]);
  const aiStop=useRef(()=>{});
  const [game, setGame] = useState<Game>(createGame);
  const [viewer, setViewer] = useState<Side | null>('red');
  const [selected, setSelected] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<{ side: Side; next: 'setup' | 'play' }>({ side: 'red', next: 'setup' });
  const [modal, setModal] = useState<Modal>(null);
  const [prefs, setPrefs] = useState<Preferences>(readPrefs);
  const [busy, setBusy] = useState(false);
  const actionLocked = useRef(false);
  const turnSequence = useRef(0);
  const [motionBoard,setMotionBoard]=useState<Game|null>(null);
  const publicBoard=motionBoard??game;
  const chronicle=publicBoard.captures;
  const [impactDisclosure,setImpactDisclosure]=useState<Capture|null>(null);
  const [reveal, setReveal] = useState<Capture | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [notice, setNotice] = useState('');
  const [fullLog,setFullLog]=useState(false);
  const sceneHost = useRef<HTMLDivElement>(null), scene = useRef<BoardScene | null>(null);
  const clickRef = useRef<(x: number, y: number) => void>(() => {});
  const pending = useRef<(() => void) | null>(null), timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [zoom, setZoom] = useState(1);
  const visible = viewFor(game, phase === 'handoff' ? null : viewer);
  const hudPieces=publicBoard===game?visible:viewFor(publicBoard,viewer);
  const inGame = phase === 'setup' || phase === 'play' || phase === 'handoff' || phase === 'result';
  const moves = phase === 'play' && selected && !busy ? (chargeIntent?allActions(game).filter(a=>a.id===selected&&a.kind==='charge'):legalMoves(game, selected)) : [];
  const selectedPiece = visible.find(p => p.id === selected);
  const ritualMode=modeOf(game)==='ritual';

  useLayoutEffect(() => {
    if (!sceneHost.current) return;
    try { scene.current = new BoardScene(sceneHost.current, (x, y) => clickRef.current(x, y)); }
    catch { setWebglError(true); }
    if(scene.current){
      scene.current.onBattleCue=(kind,options)=>sound.play(kind,options);
      scene.current.onBattleCancel=group=>sound.stopGroup(group);
      scene.current.onBoardContact=(actor,step,ritual,reveals)=>setMotionBoard(board=>{
        if(!board)return board;
        const pieces=board.pieces.filter(p=>p.id!==step.victimId).map(p=>{
          if(p.id===actor)return {...p,x:step.x,y:step.y,charging:undefined};
          return reveals.some(r=>r.id===p.id)?{...p,revealed:true}:p;
        });
        return {...board,pieces,ritual};
      });
      scene.current.onPublicCapture=c=>{
        setImpactDisclosure(c);
        setMotionBoard(board=>board?{...board,captures:[...board.captures,c]}:board);
      };
    }
    return () => { scene.current?.destroy(); timers.current.forEach(clearTimeout); };
  }, []);
  useLayoutEffect(() => {
    scene.current?.setQuality(prefs.quality);
    scene.current?.syncLayout();
    scene.current?.update({ pieces: visible, selected, legal: moves, viewer, cinematic: prefs.cinematic, reduced: prefs.reduced, deployment: phase === 'setup', active: inGame,mode:modeOf(game),ritual:game.ritual,preview:ritualMode&&selectedPiece?.charging&&game.turn===selectedPiece.side?executionPath({pieces:visible},selectedPiece.id):[],pendingCharge:chargeIntent?selected:null });
  }, [game, selected, viewer, phase, busy, prefs.cinematic, prefs.reduced,prefs.quality,chargeIntent]);
  useEffect(() => {
    sound.music = prefs.music; sound.effects = prefs.effects; sound.muted = prefs.muted; sound.update();
    try { localStorage.setItem('shadow-king-settings', JSON.stringify(prefs)); } catch { /* storage is optional */ }
  }, [prefs]);
  useEffect(()=>{if(!chargeIntent)sound.stopGroup('charge-preview');},[chargeIntent]);
  useEffect(() => { sound.setMode(phase === 'result' ? 'ending' : inGame ? 'game' : 'menu'); }, [inGame, phase]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (reveal) finishPending(); else { setChargeIntent(false);setModal(null); setSelected(null); } } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [reveal]);

  useEffect(() => {
    if (import.meta.env.MODE !== 'test') return;
    const api = {
      snapshot: () => ({ game, phase, viewer, selected, gameMode, rulesMode:modeOf(game),chargeIntent, difficulty, thinking:ai.thinking,quality:prefs.quality, ai:ai.diagnostic, busy: actionLocked.current, reveal, debugProject:scene.current?.debugProject,debugInput:scene.current?.debugInput, lastHit: scene.current?.lastHit, attack:scene.current?.lastAttack,
        actors: Array.from(scene.current?.actors.entries() || [], ([id,a]) => ({id, role:a.role, x:a.group.position.x+3, y:a.group.position.z+3, targetX:a.target.x+3, targetY:a.target.z+3})),
        rendered: viewFor(game, viewer), audioState: sound.ctx?.state, lastSound:sound.lastKind,audioEffects:sound.activeEffects.size,activeBurst:!!scene.current?.burst,
        renderedFrames:scene.current?.renderedFrames,rendering:scene.current?{batchingEnabled:scene.current.batchingEnabled,batches:scene.current.batches.stats,bufferResizes:scene.current.bufferResizes,density:scene.current.renderer.getPixelRatio(),buffer:[scene.current.renderer.domElement.width,scene.current.renderer.domElement.height]}:null,renderInfo:scene.current?{calls:scene.current.renderer.info.render.calls,triangles:scene.current.renderer.info.render.triangles}:null,
        models:Array.from(scene.current?.actors.values()||[],a=>{let vertices=0,meshes=0;a.model.traverse(o=>{const g=(o as {geometry?:{attributes?:{position?:{count:number}}}}).geometry;if(g?.attributes?.position){vertices+=g.attributes.position.count;meshes++;}});return{role:a.role,vertices,meshes};}),
        altarCells:scene.current?.fx.altar.visible?9:0,fxState:scene.current?{altar:scene.current.fx.active,occupied:scene.current.fx.occupied,charges:scene.current.fx.charges.size,action:!!scene.current.fx.action,transients:scene.current.fx.transients.length,cues:scene.current.cueLog}:null,layoutReady:scene.current?.layoutReady(),
        camera: scene.current ? {angle:scene.current.angle, desiredAngle:scene.current.desiredAngle, viewer:scene.current.state.viewer, zoom:scene.current.zoom, desiredZoom:scene.current.desiredZoom} : null }),
      loadRitualFixture:async(name:import('./ritual-qa').RitualFixture,opponent:'local'|'ai'='local')=>{
        const {ritualFixture}=await import('./ritual-qa');cancelTurn();scene.current?.resetActors();const fixture=ritualFixture(name);
        setRulesMode('ritual');setGameMode(opponent);setDifficulty('master');setHistory([]);setGame(fixture);setViewer('red');setPhase('play');setModal(null);scene.current?.resetCamera();
      },
      loadState:(g:Game,level:Difficulty='omniscient')=>{cancelTurn();scene.current?.resetActors();setGame(g);setRulesMode(modeOf(g));setGameMode('ai');setDifficulty(level);setHistory([]);setViewer('red');setPhase('play');setModal(null);},
      audioProbe:async()=>{const q=await import('./combat-qa');return q.audioProbe();},
      setBatching:(enabled:boolean)=>scene.current?.setBatching(enabled),
      combatFrame:async()=>{const q=await import('./combat-qa');return {...q.combatFrame(scene.current!),audio:sound.stats,audioCues:sound.accepted};},
      combatProbe:async()=>{const q=await import('./combat-qa');return q.combatProbe(scene.current!);},
      modelState:async()=>{const q=await import('./lifecycle-qa');return q.modelState(scene.current!);},
      holdAction:(progress:number|null)=>{if(scene.current)scene.current.debugActionProgress=progress;},
      stressV04:async()=>{const q=await import('./v04-qa');return q.stressV04(scene.current!);},
      stressModels:async()=>{const q=await import('./lifecycle-qa');return q.stressModels(scene.current!);},
      qualityProbe:async()=>{const q=await import('./quality-qa');return q.qualityProbe(scene.current!);},
      replacementProbe:async()=>{const q=await import('./lifecycle-qa');return q.replacementProbe(scene.current!);},
      project: (x:number,y:number,height=.14) => scene.current?.projectCell(x,y,height),
      loadAIFixture: async (name:FixtureName,attacker:Role='guard',level:Difficulty='normal')=>{
        const {fixture}=await import('./qa');cancelTurn();scene.current?.resetActors();actionLocked.current=false;
        const f=fixture(name,attacker),flip=(s:Side):Side=>s==='red'?'blue':'red';
        setGame({...f,turn:'blue',pieces:f.pieces.map(p=>({...p,side:flip(p.side)})),captures:f.captures.map(c=>({...c,side:flip(c.side),by:flip(c.by)}))});
        setGameMode('ai');setDifficulty(level);setHistory([]);setBusy(false);setReveal(null);setSelected(null);setViewer('red');setPhase('play');setModal(null);scene.current?.resetCamera();
      },
      loadFixture: async (name: FixtureName, attacker: Role = 'king',mode:'local'|'ai'='local') => {
        const {fixture} = await import('./qa');
        cancelTurn(); scene.current?.resetActors(); actionLocked.current = false;
        setRulesMode('classic');setGameMode(mode);setHistory([]);setBusy(false); setReveal(null); setSelected(null); setGame(fixture(name,attacker)); setViewer('red'); setPhase('play'); setModal(null);
        scene.current?.resetCamera();
      },
    };
    (window as unknown as { __SK_QA__: typeof api }).__SK_QA__ = api;
    return () => { delete (window as unknown as {__SK_QA__?:unknown}).__SK_QA__; };
  });

  const unlock = () => { void sound.unlock().catch(() => {}); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const cancelTurn = () => { setMotionBoard(null);setImpactDisclosure(null);revealQueue.current=[];setChargeIntent(false);turnSequence.current++; aiStop.current(); clearTimers(); pending.current = null; scene.current?.cancelMove(); actionLocked.current=false;setBusy(false);setReveal(null);setSelected(null);sound.silenceEffects(); };
  const finishPending = () => { setImpactDisclosure(null);if(revealQueue.current.length){setReveal(revealQueue.current.shift()!);sound.play('reveal');return;}clearTimers(); const done = pending.current; pending.current = null; setReveal(null); done?.(); };
  const prepareHandoff = (side: Side, next: 'setup' | 'play') => {
    sound.silenceEffects();setSelected(null); setViewer(null); setHandoff({ side, next }); setPhase('handoff'); actionLocked.current = false; setBusy(false);
  };
  const newMatch = (mode:'local'|'ai'=gameMode,level:Difficulty=difficulty,rule:GameMode=rulesMode) => {
    cancelTurn();scene.current?.resetActors(); setReveal(null); actionLocked.current = false; setBusy(false); setHistory([]);setGameMode(mode);setDifficulty(level);setRulesMode(rule);
    let fresh=createGame(rule);
    if(mode==='ai'){const columns=deploy('blue',level,Math.random);let i=0;fresh={...fresh,pieces:fresh.pieces.map(p=>p.side==='blue'?{...p,x:columns[i++]}:p)};}
    setGame(fresh);setModal(null);setZoom(1);scene.current?.setZoom(1);
    if(mode==='ai'){setSelected(null);setViewer('red');setPhase('setup');}else prepareHandoff('red', 'setup');
  };
  const acceptDevice = () => { unlock(); setViewer(handoff.side); setPhase(handoff.next); setSelected(null); sound.play('turn'); };
  const completeSetup = () => {
    sound.play('turn');
    if(gameMode==='ai'){setGame(g=>startGame(g));setSelected(null);setViewer('red');setPhase('play');}
    else if (viewer === 'red') prepareHandoff('blue', 'setup');
    else { setGame(g => startGame(g)); prepareHandoff('red', 'play'); }
  };
  const executeAction = (action:GameAction,byAI=false) => {
    if (actionLocked.current || busy || phase !== 'play' || (gameMode==='ai'?(byAI?game.turn!=='blue':game.turn!=='red'):viewer!==game.turn) || game.result) return;
    const {id,x,y}=action,next=act(game,action);if(next===game)return;
    const actor=game.pieces.find(p=>p.id===id)!,caps=next.captures.slice(game.captures.length),token=++turnSequence.current;
    const exposed=actor.revealed||action.kind==='charge'||action.kind==='execute';
    const visibleRole=actor.side===viewer||exposed?actor.role:'unknown';
    if(exposed)scene.current?.revealActor(id,actor.role);
    const steps=ritualMode?next.lastAction!.steps:[{x,y,...(caps.length?{victimId:game.pieces.find(p=>p.x===x&&p.y===y)?.id}:{})}];
    const motion=scene.current?.animatePath(id,visibleRole,steps,prefs.reduced,action.kind==='execute',{charge:action.kind==='charge',publicBeats:publicBeats(next,game.captures.length,steps)});
    setMotionBoard(game);
    actionLocked.current=true;setBusy(true);setSelected(null);setChargeIntent(false);setGame(next);
    setHistory(h=>[...h,{id,side:actor.side,from:{x:actor.x,y:actor.y},to:{x:next.pieces.find(p=>p.id===id)!.x,y:next.pieces.find(p=>p.id===id)!.y},...(caps.length?{captured:caps.at(-1)!.role}:{}),...(action.kind?{kind:action.kind}:{})}]);
    const done=()=>{actionLocked.current=false;setBusy(false);if(next.result){sound.silenceEffects();setViewer(null);setPhase('result');}else if(gameMode==='ai'){setViewer('red');setPhase('play');setSelected(null);}else prepareHandoff(next.turn,'play');};
    pending.current=done;
    void (motion??Promise.resolve(true)).then(completed=>{
      if(!completed||turnSequence.current!==token)return;
      setMotionBoard(null);
      if(caps.length){revealQueue.current=caps.slice(1);setImpactDisclosure(null);setReveal(caps[0]);sound.play('reveal');}else finishPending();
    });
  };
  const executeMove=(id:string,x:number,y:number)=>executeAction({id,x,y,...(chargeIntent?{kind:'charge' as const}:{})});
  clickRef.current = (x, y) => {
    if (modal || actionLocked.current || busy || !viewer || gameMode==='ai'&&phase==='play'&&game.turn!=='red') return;
    const p = visible.find(q => q.x === x && q.y === y);
    if (phase === 'setup') {
      if (p?.side !== viewer) return;
      sound.play('select');
      if (selected && selected !== p.id) { setGame(g => swapSetup(g, viewer, selected, p.id)); setSelected(null); }
      else setSelected(selected === p.id ? null : p.id);
    } else if (phase === 'play') {
      if(chargeIntent&&selected&&allActions(game).some(a=>a.id===selected&&a.kind==='charge'&&a.x===x&&a.y===y)){executeMove(selected,x,y);return;}
      if (p?.side === viewer) { sound.play('select');setChargeIntent(false);setSelected(selected === p.id ? null : p.id); }
      else if (selected) {
        if (legalMoves(game, selected).some(m => m.x === x && m.y === y)) executeMove(selected, x, y);
        else {setChargeIntent(false);setSelected(null);}
      }
    }
  };
  const observation=useMemo(()=>gameMode==='ai'&&phase==='play'&&game.turn==='blue'&&!game.result?observe(game,'blue',history,difficulty==='omniscient'?'omniscient':undefined):null,[gameMode,phase,game,history,difficulty]);
  const ai=useAI(observation,difficulty,busy||!!modal,id=>{setSelected(id);sound.play('select');},a=>executeAction(a,true));
  aiStop.current=ai.stop;
  const shuffle = () => {
    if (!viewer) return; let g = game;
    const pieces = g.pieces.filter(p => p.side === viewer);
    for (let i = pieces.length - 1; i > 0; i--) g = swapSetup(g, viewer, pieces[i].id, pieces[Math.floor(Math.random() * (i + 1))].id);
    setGame(g); setSelected(null); sound.play('select');
  };
  const openModal = (m: Modal) => { unlock(); setModal(m); };
  const setCameraZoom = (delta: number) => { const n = Math.max(.8, Math.min(1.25, zoom + delta)); setZoom(n); scene.current?.setZoom(n); };

  return <div className={`app phase-${phase} ${prefs.reduced ? 'reduced-motion' : ''} ${gameMode==='ai'&&difficulty==='omniscient'?'omniscient-match':''}`} onPointerDown={unlock}>
    <div className="grain"/>
    <header className="topbar">
      <button className="brand" onClick={() => inGame ? openModal('leave') : setPhase('menu')} aria-label="暗王主菜单"><Crest/><span>暗王 <i>SHADOW KING</i></span></button>
      <div className="header-center">{inGame ? <><span className="live-dot"/>{phase==='result'?'棋局结束':phase==='handoff'?'隐私交接':phase==='setup'?'布阵':busy?'动作播放':gameMode==='ai'?(game.turn==='red'?'你行动':'对手思考'): `${sideName[game.turn]}行动`} · {ritualMode?'祭典 · ':'经典 · '}{gameMode==='ai'?(difficulty==='omniscient'?'全知者 · 透视挑战':`人机对战 · ${DIFFICULTIES[difficulty].name}`):'本地双人'} <b>／</b> {phase === 'setup' || handoff.next === 'setup' && phase === 'handoff' ? '秘密布阵' : `第 ${Math.floor(game.ply / 2) + 1} 回合`}</> : <><span className="tiny-diamond"/> 神秘 · 谋略 · 命运 <span className="tiny-diamond"/></>}</div>
      <nav className="header-actions"><button className="icon-button" onClick={() => setPrefs({ ...prefs, muted: !prefs.muted })} title={prefs.muted ? '开启声音' : '静音'} aria-label={prefs.muted ? '开启声音' : '静音'}>{prefs.muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button><button className="icon-button" onClick={() => openModal('settings')} aria-label="设置" title="设置"><Settings2 size={17}/></button><span className="edition">第一章 · 永夜王庭</span></nav>
    </header>

    <div className={`scene-wrap ${inGame ? 'game-scene' : 'menu-scene'}`}>
      <div ref={sceneHost} className="scene-host"/>
      {webglError && <div className="fallback-board" role="group" aria-label="兼容模式棋盘">{Array.from({ length: 49 }, (_, i) => { const x = i % 7, y = Math.floor(i / 7), p = visible.find(q => q.x === x && q.y === y); return <button key={i} className={`${(x + y) % 2 ? 'dark' : ''} ${moves.some(m => m.x === x && m.y === y) ? 'legal' : ''}`} aria-label={`${coord(x, y)} ${p ? `${sideName[p.side]} ${roleName[p.role]}` : '空格'}`} onClick={() => clickRef.current(x, y)}>{p && <PieceIcon role={p.role} className={p.side}/>}</button>; })}</div>}
      {!inGame && <><div className="scene-caption"><span className="overline">THE COURT OF ETERNAL NIGHT</span><span>永夜王庭</span><i>七枚棋子 · 三种命运</i></div><div className="scene-bottom"><span>✧</span> 每一张面孔之下，都藏着另一种命运 <span>✧</span></div></>}
      {inGame && phase !== 'handoff' && <div className="camera-controls"><button onClick={() => scene.current?.rotate()} title="旋转棋盘" aria-label="旋转棋盘"><RotateCw size={16}/></button><span/><button onClick={() => setCameraZoom(-.1)} title="缩小" aria-label="缩小"><ZoomOut size={16}/></button><button onClick={() => setCameraZoom(.1)} title="放大" aria-label="放大"><ZoomIn size={16}/></button><button onClick={() => { scene.current?.resetCamera(); setZoom(1); }} title="重置视角" aria-label="重置视角"><Maximize size={15}/></button></div>}
    </div>

    {ritualMode&&phase==='play'&&!reveal&&!modal&&<BoardHUD scene={scene} game={publicBoard} pieces={hudPieces} selected={selectedPiece} legal={moves} chargeIntent={chargeIntent} canAct={!busy&&viewer===game.turn&&(gameMode!=='ai'||game.turn==='red')} charge={()=>{setChargeIntent(true);sound.play('charge',{group:'charge-preview'});}} cancel={()=>{setChargeIntent(false);setSelected(null);}} execute={executeAction}/>}
    {phase==='play'&&busy&&!reveal&&<button className="skip-battle" onClick={()=>{sound.silenceEffects();scene.current?.skipMove();}}>跳过动作</button>}
    {!inGame && <main className="menu-content">
      {phase === 'menu' ? <div className="hero-copy"><div className="eyebrow"><span/> A GAME OF HIDDEN FATES</div><h1>暗<span>王</span></h1><div className="english-title">SHADOW KING</div><div className="title-divider"><span/>◆<span/></div><h2>藏起王冠，改写命运。</h2><p className="intro">在永夜笼罩的王庭，身份是最后的秘密。<br/>你的一步，是谋略；他的牺牲，或是胜利。</p><button className="primary start-button" onClick={() => setPhase('mode')}><Swords size={18}/><span>开启棋局<small>ENTER THE COURT</small></span><ArrowRight size={20}/></button><div className="menu-links"><button onClick={() => openModal('rules')}><BookOpen size={15}/>快速玩法</button><span/><button onClick={() => openModal('credits')}><Info size={15}/>制作信息</button></div><div className="local-note"><Monitor size={13}/> 隐藏身份策略棋 · 人机 / 本地双人 · 无需注册</div></div> : phase==='difficulty'?<OpponentSelect difficulty={difficulty} rule={rulesMode} select={setDifficulty} back={()=>setPhase('mode')} start={()=>newMatch('ai',difficulty)}/> : <div className="mode-panel"><button className="text-back" onClick={() => setPhase('menu')}><ArrowLeft size={15}/>返回主菜单</button><div className="eyebrow">CHOOSE YOUR FATE</div><h2>选择规则与对手</h2><p>先选择规则模式，再选择对战方式。</p><div className="rules-selector" aria-label="规则模式"><button aria-pressed={rulesMode==='classic'} onClick={()=>setRulesMode('classic')}>经典模式<small>CLASSIC</small></button><button aria-pressed={rulesMode==='ritual'} onClick={()=>setRulesMode('ritual')}>祭典模式<small>RITE OF SHADOWS</small></button></div><p className="mode-rule-note">{rulesMode==='classic'?'原有规则：三死士全灭立即获胜，影卫无技能。':'实验规则：公开王争夺祭台；每名影卫独立一次向前斩杀。'}</p><button className="mode-card" onClick={() => newMatch('local')}><Users size={28} strokeWidth={1}/><div><strong>本地双人</strong><small>共用一台设备，轮流秘密执棋</small><em><span className="live-dot"/>现已开放</em></div><ChevronRight size={20}/></button><button className="mode-card" onClick={()=>setPhase('difficulty')}><Swords size={28} strokeWidth={1}/><div><strong>人机对战</strong><small>玩家执红 · 四档 AI ＋全知挑战</small><em><span className="live-dot"/>五位对手 · 离线对弈</em></div><ChevronRight size={20}/></button><div className="future-modes"><div><span>在线好友对战</span><LockKeyhole size={13}/><small>未来计划</small></div></div><details className="privacy-note"><summary>本地双人 · 隐私交接说明</summary><EyeOff size={18}/><p>每次交换执棋者前，棋局将被遮蔽。<br/>请在交接画面出现后，再将设备交给对方。</p></details></div>}
    </main>}

    {!inGame && <footer className="menu-footer"><div className="fate-item"><span className="roman">I</span><Crown size={22} strokeWidth={1}/><div><strong>弑王</strong><small>夺其王冠，终结王权</small></div></div><div className="fate-item"><span className="roman">II</span><Shield size={22} strokeWidth={1}/><div><strong>破阵</strong><small>击溃影卫，瓦解守护</small></div></div><div className="fate-item"><span className="roman">III</span><Sparkles size={22} strokeWidth={1}/><div><strong>献祭</strong><small>经典：三死士阵亡即胜；祭典：开启争夺祭台</small></div></div><div className="footer-motto">祭典须王占祭台，守过对手回应。<small>NOT EVERY CAPTURE IS A VICTORY.</small></div></footer>}

    {inGame && <main className="game-layout">
      <aside className="left-sidebar"><div className="overline">{phase === 'setup' ? 'THE SECRET DEPLOYMENT' : 'YOUR COURT'}</div><div className={`player-title ${viewer || handoff.side}`}><span className="side-gem"/><h2>{sideName[viewer || handoff.side]}</h2></div><div className="player-status" role="status" aria-live="polite"><span className="live-dot"/>{phase === 'setup' ? '正在秘密布阵' : phase === 'result' ? '棋局已结束' : busy?'动作播放中':gameMode==='ai'&&game.turn==='blue'?'对手正在思考……':`${sideName[game.turn]}行动`}</div><div className="ornament-line">◆</div>
        {phase === 'setup' ? <><h3>命运，由你排列</h3><p className="sidebar-copy">点击一枚己方棋子，再点击另一枚，即可交换位置。</p><div className="setup-roster">{(['king', 'guard', 'martyr'] as Role[]).map(r => <div key={r}><PieceIcon role={r}/><span>{roleName[r]}</span><small>× {r === 'king' ? 1 : 3}</small></div>)}</div><button className="secondary full" onClick={shuffle}><Shuffle size={15}/>随机布阵</button><div className="secret-tip"><EyeOff size={17}/><p>对方的阵容已被封印。<br/>只有你能看到自己的身份。</p></div></> : <><details className="objective-details"><summary>胜利条件</summary><div className="objectives"><div><Crown size={18}/><p><strong>弑王</strong><small>吃掉敌方的王</small></p></div><div><Shield size={18}/><p><strong>影卫覆灭</strong><small>吃掉敌方全部 3 名影卫</small></p></div><div><Sparkles size={18}/><p><strong>{ritualMode?'终焉祭典':'死士献祭'}</strong><small>{ritualMode?'三死士全灭后，王占祭台并守过回应':'让己方 3 名死士被敌方吃掉'}</small></p></div></div></details><RitualStatus game={publicBoard}/><div className="selected-card">{selectedPiece ? <><PieceIcon role={selectedPiece.role}/><div><small>已选中 · {coord(selectedPiece.x, selectedPiece.y)}</small><strong>{roleName[selectedPiece.role]}</strong><p>{`${moves.length} 个合法落点`}</p></div></> : <><div className="empty-diamond">◇</div><div><small>静待你的抉择</small><strong>选择一枚棋子</strong><p>上下左右，步步为谋</p></div></>}</div><div className={`quiet-count ${game.quiet>=50?'urgent':''}`}><span>距无吃子平局</span><b>{Math.ceil((CONFIG.quietFullRounds * 2 - game.quiet) / 2)} <small>完整回合</small></b></div></>}
        <div className="sidebar-bottom"><button onClick={() => openModal('rules')}><BookOpen size={15}/>规则手册</button>{phase === 'play' && <button onClick={() => openModal('resign')} disabled={busy}><Flag size={15}/>认输</button>}<button onClick={() => openModal('restart')} disabled={busy}><RotateCw size={15}/>重新开始</button></div>
      </aside>
      <section className="board-interface" aria-label="棋局"><div className="board-heading">{gameMode==='ai'&&difficulty==='omniscient'&&<div className="challenge-ribbon"><Eye size={14}/>全知者 · 透视挑战</div>}<span className="overline">{phase === 'setup' ? 'ARRANGE YOUR DESTINY' : 'THE SILENT BATTLE'}</span><h2>{phase === 'setup' ? '秘密布阵' : '永夜棋局'}</h2><span className="compact-status">{phase==='result'?'棋局结束':phase==='handoff'?'隐私交接':busy?'动作播放中':phase==='setup'?`${sideName[viewer||handoff.side]} · 秘密布阵`:gameMode==='ai'?(game.turn==='red'?'你行动':'对手思考中'):`${sideName[game.turn]}行动`} · 第 {Math.floor(game.ply/2)+1} 回合 · {ritualMode?'祭典':'经典'}{gameMode==='ai'?` · ${DIFFICULTIES[difficulty].label}`:''}</span></div>

        {ritualMode&&publicBoard.ritual&&Object.values(publicBoard.ritual).some(r=>r.phase==='open'||r.phase==='occupied')&&<div className={`altar-state-banner ${Object.values(publicBoard.ritual).some(r=>r.phase==='occupied')?'occupied':''}`} role="status"><Sparkles size={18}/><div><strong>{Object.values(publicBoard.ritual).some(r=>r.phase==='occupied')?'祭台占领中':'祭典开启'}</strong><small>{Object.values(publicBoard.ritual).some(r=>r.phase==='occupied')?'敌方拥有一次完整回应机会':'中央九格已激活 · 祭典方王永久明牌'}</small></div></div>}<div className="board-spacer"/>
        <div className="board-bottom">{phase === 'setup' ? <><p><EyeOff size={14}/> 阵容仅你可见 · 在己方底线自由交换</p><button className="mobile-shuffle secondary" onClick={shuffle}><Shuffle size={16}/>随机</button><button className="primary" onClick={completeSetup}><Check size={17}/>确认布阵<ArrowRight size={17}/></button></> : <><p><span className="tiny-diamond"/>{chargeIntent?'选择普通移动落点，或原地完成蓄力。':busy ? '命运正在揭晓…' : gameMode==='ai'&&game.turn==='blue'?'对手正在思考……':selectedPiece ? '选择亮起的落点，完成这一步。' : '点击己方棋子，查看可行之路。'}</p><small><span className="desktop-help">右键拖动旋转视角 · 点击落子</span><span className="touch-help">轻触棋子，再轻触标记落点</span></small></>}</div>
        {phase !== 'handoff' && <div className="sr-board" aria-label="键盘棋盘">{Array.from({ length: 49 }, (_, i) => { const x = i % 7, y = Math.floor(i / 7), p = hudPieces.find(q => q.x === x && q.y === y); return <button key={i} onClick={() => clickRef.current(x, y)} aria-label={`${coord(x, y)} ${p ? `${sideName[p.side]} ${roleName[p.role]}` : '空格'}`}>{coord(x, y)} {p ? roleName[p.role] : '空格'}</button>; })}</div>}
      </section>
      <aside className="right-sidebar"><div className="overline">CHRONICLE OF FATES</div><h2>战局纪事 <span>{chronicle.length.toString().padStart(2, '0')}</span></h2><p className="public-label"><EyeOff size={12}/>仅记载已公开的身份</p><div className="capture-summary">{(['red', 'blue'] as Side[]).map(s => <div key={s} className={s}><span className="side-gem"/><strong>{s === 'red' ? '红方' : '蓝方'}阵亡</strong><div>{(['king', 'guard', 'martyr'] as Role[]).map(r => <span key={r} title={`${roleName[r]}已阵亡数量`}><PieceIcon role={r}/><small>{chronicle.filter(c => c.side === s && c.role === r).length}/{r === 'king' ? 1 : 3}</small></span>)}</div>{chronicle.some(c=>c.side===s)&&<ol className="fallen-spirits" aria-label={`${s==='red'?'红方':'蓝方'}阵亡棋子`}>{chronicle.filter(c=>c.side===s).map((c,i)=><li key={c.id??i} title={`${roleName[c.role]} · ${c.at}`} aria-label={roleName[c.role]}><PieceIcon role={c.role}/></li>)}</ol>}</div>)}</div><div className="log-details"><button className="log-toggle" onClick={()=>setFullLog(!fullLog)} aria-expanded={fullLog}>{fullLog?'收起完整战报':'最近事件 · 查看完整战报'}</button><div className="chronicle">{chronicle.length ? [...chronicle].reverse().slice(0,fullLog?undefined:1).map((c, i) => <article key={i}><span className="log-number">{Math.ceil(c.ply / 2).toString().padStart(2, '0')}</span><div><strong><span className={c.side}>{c.side === 'red' ? '红方' : '蓝方'}</span> · {roleName[c.role]}揭示</strong><p>{c.at} 的封印已破碎</p></div></article>) : <div className="empty-log"><Swords size={25} strokeWidth={.8}/><p>尚无封印被打破</p><small>真正的故事，始于第一次抉择。</small></div>}</div></div><div className="round-counter"><span>ROUND</span><strong>{(Math.floor(game.ply / 2) + 1).toString().padStart(2, '0')}</strong><small>{game.ply} 步已落定</small></div></aside>
    </main>}

    {phase === 'handoff' && <div className="handoff-screen"><div className="handoff-rune"/><div className="handoff-card"><div className="overline">THE VEIL BETWEEN TWO FATES</div><div className="privacy-seal"><EyeOff size={35} strokeWidth={.8}/></div><h1>秘密，留给执棋之人。</h1><p>请将设备交给<span className={handoff.side}>{sideName[handoff.side]}</span></p><small>上一位玩家的身份信息已被遮蔽。<br/>请确认对方已移开视线，再揭开你的棋局。</small><button className="primary" onClick={acceptDevice}>我是{handoff.side === 'red' ? '红方' : '蓝方'}，揭开帷幕<ArrowRight size={18}/></button><div className="handoff-foot"><LockKeyhole size={12}/> {handoff.next === 'setup' ? '即将进入秘密布阵' : `第 ${Math.floor(game.ply / 2) + 1} 回合 · ${handoff.side === 'red' ? '红' : '蓝'}方行动`}</div><button className="text-back" onClick={() => openModal('leave')}>返回主菜单</button></div></div>}

    {impactDisclosure&&!reveal&&busy&&<div className={`impact-disclosure ${impactDisclosure.side}`} role="status">封印破碎 · {roleName[impactDisclosure.role]}</div>}
    {reveal && <div className={`reveal-overlay ${reveal.role}`}><div className="reveal-card"><div className="card-corner tl"/><div className="card-corner tr"/><div className="card-corner bl"/><div className="card-corner br"/><span className="overline">THE SEAL IS BROKEN</span><PieceIcon role={reveal.role}/><span className={reveal.side}>{sideName[reveal.side]}</span><h2>{roleName[reveal.role]}</h2><p>{reveal.role === 'martyr' ? '这一次消逝，也许早在计划之中。' : reveal.role === 'king' ? '王冠落地，秘密终告揭晓。' : '守护者的誓言，归于永夜。'}</p><button className="text-back" onClick={finishPending}>继续 <ArrowRight size={14}/></button></div></div>}

    {phase === 'result' && game.result && <div className={`result-screen ending-${game.result.reason}`}><div className="ending-aura"/><EndCinematic key={`${game.result.reason}-${game.ply}`} reason={game.result.reason} reduced={prefs.reduced}/><div className="result-copy"><div className="overline">{endingText[game.result.reason][2]}</div><h1>{endingText[game.result.reason][0]}</h1><p className="result-quote">「{endingText[game.result.reason][1]}」</p><div className="winner-label">{game.result.winner ? <><span className={game.result.winner}>{sideName[game.result.winner]}</span> 获胜</> : '双方平局'}</div><p className="result-reason">{game.result.reason === 'quiet' ? '连续 30 个完整回合未发生吃子' : game.result.reason === 'repetition' ? '相同棋盘状态与行动方第三次出现' : game.result.reason === 'blocked' ? '当前行动方无合法移动' : game.result.reason === 'resign' ? '对方选择认输' : game.result.reason === 'ritual'?'三死士献祭后，王占领中央祭台并存活过对手的完整回应':game.result.reason === 'martyr' ? '己方三名死士全部被敌方吃掉 · 献祭完成' : game.result.reason === 'guard' ? '敌方三名影卫全部被吃掉' : '敌方的王已被吃掉'}</p><div className="result-stats"><div><small>本局回合</small><strong>{Math.ceil(game.ply / 2)}</strong></div><div><small>红方吃子</small><strong>{game.captures.filter(c => c.by === 'red').length}</strong></div><div><small>蓝方吃子</small><strong>{game.captures.filter(c => c.by === 'blue').length}</strong></div></div><div className="result-actions"><button className="primary" onClick={() => newMatch()}><RotateCw size={16}/>再来一局</button><button className="secondary" onClick={() => { cancelTurn();setPhase('menu'); setGame(createGame()); setViewer('red'); }}>返回主菜单</button></div></div></div>}

    {notice && <div className="toast" role="status">{notice}</div>}
    {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className={`modal ${modal === 'rules' ? 'rules-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button className="modal-close icon-button" aria-label="关闭" onClick={() => setModal(null)}><X size={20}/></button><div className="overline">SHADOW KING · CODEX</div><h2 id="modal-title">{modal === 'rules' ? '永夜法则' : modal === 'settings' ? '声音与仪式' : modal === 'credits' ? '关于《暗王》' : modal === 'resign' ? '放下你的王旗？' : modal === 'leave' ? '离开这场棋局？' : '重写今夜的命运？'}</h2>
      {modal === 'rules' ? <><p className="modal-intro">你知道自己的身份，却只能猜测对方的命运。</p><div className="rule-roles">{(['king', 'guard', 'martyr'] as Role[]).map(r => <div key={r}><PieceIcon role={r}/><h3>{roleName[r]} <small>×{r === 'king' ? 1 : 3}</small></h3><p>{r === 'king' ? '王被吃掉，己方立即失败。' : r === 'guard' ? '三名影卫被吃掉，己方立即失败。' : (inGame?ritualMode:rulesMode==='ritual')?'三名死士被吃掉后开启祭典，须护送王占领祭台并守过回应。':'三名死士被敌人吃掉，己方立即获胜。'}</p></div>)}</div><div className="rules-text">{gameMode==='ai'&&difficulty==='omniscient'&&<div className="challenge-disclosure"><strong>全知者 · 透视挑战</strong><p>{OMNISCIENT_NOTICE}</p></div>}{(inGame?ritualMode:rulesMode==='ritual')&&<RitualGuide/>}<h3>01 · 秘密开局</h3><p>7×7 棋盘，双方各 7 枚棋子。双方依次在自己的底线点击交换棋子，确认布阵后红方先行。敌方未公开的棋子始终为相同封印形象。{(inGame?ritualMode:rulesMode==='ritual')&&'祭典中的蓄力影卫和祭典开启后的王永久明牌。'}</p><h3>02 · 步步为谋</h3><p>每步移动一枚己方棋子，向上、下、左、右移动一格。不可斜走、越界、跳跃或占据己方格子。走到敌方格子即吃子并公开其身份。不强制吃子，不可跳过回合。</p><h3>03 · 三种胜利</h3><p>吃掉敌方的王，或吃掉敌方全部 3 名影卫，立即获胜；{(inGame?ritualMode:rulesMode==='ritual')?'祭典模式中，己方三死士全灭仅开启祭典；王还须占领祭台并守过完整回应。':'己方全部 3 名死士被敌人吃掉，也立即获胜。'}你不能主动移除自己的死士。吃子后优先判定胜负，并立即终止棋局。</p><h3>04 · 永夜僵局</h3><p>连续 {CONFIG.quietFullRounds} 个完整回合（{CONFIG.quietFullRounds * 2} 步）没有吃子；完全相同的身份、位置与行动方第三次出现；或当前玩家无合法移动，均为平局。</p><h3>05 · 保守秘密</h3><p>本地双人每步后进入隐私交接，由对方确认查看。人机对战固定由你执红，AI 执蓝，不交接设备；四档对手只依据自身身份、公开位置和战报进行本地运算。战局纪事只记录被吃掉的身份，剩余敌方身份不会公开。</p></div><button className="primary full" onClick={() => setModal(null)}>我已知晓法则<Check size={16}/></button></> : modal === 'settings' ? <><p className="modal-intro">让声音与光影，依你的节奏流动。</p><div className="setting-row"><label htmlFor="music">背景音乐 <small>原创合成氛围乐</small></label><input id="music" type="range" min="0" max="1" step=".01" value={prefs.music} onChange={e => setPrefs({ ...prefs, music: +e.target.value })}/><span>{Math.round(prefs.music * 100)}%</span></div><div className="setting-row"><label htmlFor="fx">动作音效<small>落步、材质命中、能量与结局</small></label><input id="fx" type="range" min="0" max="1" step=".01" value={prefs.effects} onChange={e => setPrefs({ ...prefs, effects: +e.target.value })}/><span>{Math.round(prefs.effects * 100)}%</span></div>{([['muted', '全部静音', '关闭音乐与音效'], ['cinematic', '电影式镜头', '命中时轻微镜头反馈'], ['reduced', '精简动画', '减少动效，加快落子与视角切换']] as const).map(([key, label, desc]) => <div className="setting-row" key={key}><label htmlFor={key}>{label}<small>{desc}</small></label><button id={key} role="switch" aria-checked={prefs[key]} className={`toggle ${prefs[key] ? 'on' : ''}`} onClick={() => setPrefs({ ...prefs, [key]: !prefs[key] })}><span/></button></div>)}<div className="quality-setting"><label htmlFor="quality">棋具画质</label><select id="quality" value={prefs.quality} onChange={e=>{if(isQuality(e.target.value))setPrefs({...prefs,quality:e.target.value});}}>{(Object.keys(QUALITY) as Quality[]).map(q=><option key={q} value={q}>{QUALITY[q].label}画质</option>)}</select><p>{QUALITY[prefs.quality].description}</p><small>低画质减少曲面和粒子，仍保留清晰棋盘及关键状态。清晰度随屏幕和棋盘尺寸适配；画面迟缓可调低画质或启用精简动画。</small></div><p className="settings-note">设置保存在当前浏览器。声音在首次点击后启用。</p></> : modal === 'credits' ? <><Crest large/><p className="credits-title">神秘 · 谋略 · 命运</p><p className="modal-intro">《暗王》是一款支持双人和离线 AI 的原创隐藏身份策略棋。<br/>有时，最勇敢的一步，是让自己被看见。</p><div className="credits-details"><p><span>视觉与棋子</span>原创 Three.js 程序化几何、石材纹理与符文</p><p><span>音乐与音效</span>原创 Web Audio 实时合成</p><p><span>技术</span>React · TypeScript · Three.js · Vite</p><p><span>版本</span>0.8.1 · 落子与命中演出 / 经典 / 祭典</p></div><p className="settings-note">图标使用 Lucide（ISC）。不含第三方角色或影视音频。<br/>刷新页面将结束当前对局，设置会保留。</p></> : <><p className="modal-intro">{modal === 'resign' ? '认输后，对方立即获胜。' : '当前对局进度不会保留。'}<br/>{modal === 'restart' ? '双方将重新进入秘密布阵阶段。' : '请确认这是你的决定。'}</p><div className="confirm-actions"><button className="secondary" onClick={() => setModal(null)}>继续棋局</button><button className="primary" onClick={() => { if (modal === 'restart') newMatch(); else if (modal === 'resign') { cancelTurn(); setGame(g => ({ ...g, result: { winner: gameMode==='ai'?'blue':g.turn === 'red' ? 'blue' : 'red', reason: 'resign' } })); setPhase('result'); setViewer(null); setModal(null); } else { cancelTurn(); setPhase('menu'); setModal(null); setViewer('red'); setGame(createGame()); setSelected(null); setBusy(false); } }}>{modal === 'resign' ? '确认认输' : modal === 'leave' ? '返回主菜单' : '重新开始'}</button></div></>}
    </section></div>}
  </div>;
}
