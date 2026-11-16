import * as T from 'three';
import {BattleEffects} from './battle-effects';
import {battleCues,impactAt,pathProgress,type BattleCue} from './battle-timeline';
import type { Side, VisiblePiece, VisibleRole } from './game';
import {type GameMode,type Rites,type ActionStep} from './ritual';
import { createCharacter, disposeCharacters, type CharacterRig } from './models';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { bodyPickMesh, cellToWorld, clientToNDC, intersectBoard,resolvePick } from './interaction';

type SceneState = { pieces: VisiblePiece[]; selected: string | null; legal: { x: number; y: number }[]; viewer: Side | null; cinematic: boolean; reduced: boolean; deployment: boolean; active: boolean; mode?:GameMode; ritual?:Rites; preview?:ActionStep[]; pendingCharge?:string|null };
type Actor = { group: T.Group; model: T.Group; rune: T.Mesh; role: VisibleRole; side: Side; target: T.Vector3; moving: number; pick: T.Mesh; rig?: CharacterRig; revealStarted?:number; rest:()=>void; disposed:boolean };
const GOLD = 0xb7955d, RED = 0xd7654e, BLUE = 0x6ca9bd;
const mat = (color: T.ColorRepresentation, metalness = .55, roughness = .42) => new T.MeshStandardMaterial({ color, metalness, roughness });
const metal = mat(GOLD, .8, .3), darkMetal = mat(0x403b2d, .76, .35), obsidian = mat(0x111c20, .6, .5);

function mesh(geo: T.BufferGeometry, material: T.Material, x = 0, y = 0, z = 0, parent?: T.Object3D) {
  const m = new T.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = material instanceof T.MeshStandardMaterial; m.receiveShadow = true; parent?.add(m); return m;
}
function cylinder(parent: T.Object3D, top: number, bottom: number, h: number, y: number, material: T.Material, count = 32) {
  return mesh(new T.CylinderGeometry(top, bottom, h, count), material, 0, y, 0, parent);
}
function line(parent: T.Object3D, points: T.Vector3[], color: number, opacity = .65) {
  const l = new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({ color, transparent: true, opacity })); parent.add(l); return l;
}
function ring(parent: T.Object3D, r: number, y: number, color = GOLD, opacity = .5) {
  const m = mesh(new T.RingGeometry(r, r + .012, 72), new T.MeshBasicMaterial({ color, transparent: true, opacity, side: T.DoubleSide }), 0, y, 0, parent);
  m.rotation.x = -Math.PI / 2; return m;
}
function makeActor(p: VisiblePiece): Actor {
  const group=new T.Group(),{model,pick,rig}=createCharacter(p.role,p.side);
  group.add(model,pick);
  const rune=ring(group,.37,.025,p.role==='martyr'?0xb394ce:p.side==='red'?RED:BLUE,.35);
  group.position.copy(cellToWorld(p.x,p.y,.18));
  const parts=[model,...Object.values(rig??{})],poses=parts.map(part=>({part,position:part.position.clone(),rotation:part.rotation.clone(),scale:part.scale.clone()}));
  const materials=new Map<T.Material,{opacity:number;transparent:boolean;depthWrite:boolean}>();model.traverse(o=>{if(o instanceof T.Mesh)for(const m of(Array.isArray(o.material)?o.material:[o.material]))materials.set(m,{opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite});});
  const rest=()=>{group.scale.setScalar(1);group.visible=true;for(const p of poses){p.part.visible=true;p.part.position.copy(p.position);p.part.rotation.copy(p.rotation);p.part.scale.copy(p.scale);}model.traverse(o=>{if(o instanceof T.Mesh)o.visible=true;});for(const[m,r]of materials){const changed=m.transparent!==r.transparent||m.depthWrite!==r.depthWrite;m.opacity=r.opacity;m.transparent=r.transparent;m.depthWrite=r.depthWrite;if(changed)m.needsUpdate=true;}};
  group.userData={x:p.x,y:p.y,actorId:p.id};
  return {group,model,pick,rig,rune,role:p.role,side:p.side,target:group.position.clone(),moving:0,rest,disposed:false};
}

export class BoardScene {
  renderer: T.WebGLRenderer;
  environment: T.WebGLRenderTarget;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(36, 1, .1, 100);
  root = new T.Group();
  actors = new Map<string, Actor>();
  tiles: T.Mesh[] = [];
  marks = new T.Group();
  particles: T.Points;
  ray = new T.Raycaster();
  pointer = new T.Vector2();
  state: SceneState = { pieces: [], selected: null, legal: [], viewer: 'red', cinematic: true, reduced: false, deployment: false, active: false };
  frame = 0;
  fx:BattleEffects;
  onBattleCue:((kind:string)=>void)|null=null;
  debugActionProgress:number|null=null;
  cueLog:{id:string;kind:string;index?:number}[]=[];
  observer: ResizeObserver;
  onCell: (x: number, y: number) => void;
  angle = .55; desiredAngle = .55; zoom = 1; desiredZoom = 1;
  burst: { group: T.Group; start: number } | null = null;
  down: { x: number; y: number; id: number; button: number } | null = null; dragging = false;
  debugInput: unknown = null;
  debugProject: unknown = null;
  lastHit: { x: number; y: number; source: string } | null = null;
  transition: {id:string; victimId?:string; role:VisibleRole; actor:Actor; victim?:Actor; victims:{id:string;actor:Actor;index:number}[]; steps:ActionStep[]; execution:boolean; cues:BattleCue[]; emitted:Set<number>; silent:boolean; impacts:Set<number>; restore:()=>void; from:T.Vector3; to:T.Vector3; start:number; duration:number; impact:boolean; finish:(completed:boolean)=>void} | null = null;
  lastAttack: {role:VisibleRole; victimId?:string; dissolved:boolean;execution?:boolean;path?:ActionStep[]} | null = null;
  private riteShake=0;
  private dirty = true; private lastRender=0;
  private dead = false;
  private measuredWidth = 0; private measuredHeight = 0;
  private last = performance.now();
  private lastCamera = performance.now();
  constructor(public host: HTMLElement, onCell: (x: number, y: number) => void) {
    this.onCell = onCell;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace; this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.3;
    this.renderer.domElement.setAttribute('aria-label', '可交互的三维魔法棋盘，点击己方棋子，再点击亮起的合法格子');
    this.renderer.domElement.setAttribute('role', 'img');
    host.appendChild(this.renderer.domElement);
    const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();
    this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.65;
    room.dispose();pmrem.dispose();
    this.scene.fog = new T.FogExp2(0x0c1215, .032);
    this.scene.add(this.root); this.root.add(this.marks);this.fx=new BattleEffects(this.root);
    this.scene.add(new T.AmbientLight(0x9aabb4, 1.35));
    const key = new T.DirectionalLight(0xffe0b7, 2.8); key.position.set(-4, 12, 7); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7; key.shadow.normalBias = .035; this.scene.add(key);
    const cold = new T.DirectionalLight(0x77b4d0, 2.2); cold.position.set(5, 5, -7); this.scene.add(cold);
    const rim = new T.PointLight(0x9974ab, 9, 18); rim.position.set(-6, 3, -4); this.scene.add(rim);
    this.makeBoard(); this.makeHall();
    const positions = new Float32Array(160 * 3);
    for (let i = 0; i < 160; i++) { positions[i * 3] = (Math.random() - .5) * 22; positions[i * 3 + 1] = Math.random() * 7; positions[i * 3 + 2] = (Math.random() - .5) * 18; }
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(positions, 3));
    this.particles = new T.Points(pg, new T.PointsMaterial({ color: 0xd5b782, size: .022, transparent: true, opacity: .6, depthWrite: false, blending: T.AdditiveBlending })); this.scene.add(this.particles);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host); this.resize();
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
    this.renderer.domElement.addEventListener('pointermove', this.pointerMove);
    this.renderer.domElement.addEventListener('contextmenu', this.contextMenu);
    this.renderer.domElement.addEventListener('pointercancel', this.pointerCancel);
    this.renderer.domElement.addEventListener('lostpointercapture', this.pointerCancel);
    this.animate();
  }
  private stoneTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d')!;
    let seed = 101;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    ctx.fillStyle = '#bab7a9'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 7000; i++) { const v = 100 + Math.floor(rand() * 100); ctx.fillStyle = `rgba(${v},${v},${v},.15)`; ctx.fillRect(rand() * 128, rand() * 128, rand() * 3, rand() * 2); }
    for (let i = 0; i < 7; i++) { ctx.strokeStyle = 'rgba(34,40,37,.12)'; ctx.lineWidth = rand() * 1.5; ctx.beginPath(); const x = rand() * 128; ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 30, 40, x - 25, 75, x + 10, 128); ctx.stroke(); }
    const tx = new T.CanvasTexture(c); tx.colorSpace = T.SRGBColorSpace; return tx;
  }
  private makeBoard() {
    const texture = this.stoneTexture();
    const stone = mat(0x313d3d, .25, .8); stone.map = texture; stone.bumpMap=texture; stone.bumpScale=.024;
    const pale = mat(0x88908a, .25, .75); pale.map = texture; pale.bumpMap=texture; pale.bumpScale=.018;
    mesh(new T.BoxGeometry(8.1, .35, 8.1), mat(0x242e2f, .5, .6), 0, -.2, 0, this.root);
    mesh(new T.BoxGeometry(7.8, .16, 7.8), darkMetal, 0, .005, 0, this.root);
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const tile = mesh(new T.BoxGeometry(.98, .15, .98), (x + y) % 2 ? stone : pale, x - 3, .065, y - 3, this.root);
      tile.userData = { x, y }; this.tiles.push(tile);
    }
    for (const s of [-1, 1]) {
      mesh(new T.BoxGeometry(8.05, .065, .035), metal, 0, .1, s * 3.98, this.root);
      mesh(new T.BoxGeometry(.035, .065, 8.05), metal, s * 3.98, .1, 0, this.root);
      mesh(new T.BoxGeometry(7.3, .025, .025), metal, 0, .15, s * 3.63, this.root);
      mesh(new T.BoxGeometry(.025, .025, 7.3), metal, s * 3.63, .15, 0, this.root);
      for (let i = 0; i < 7; i++) {
        this.label('ABCDEFG'[i], i - 3, .16, s * 3.8, s === 1 ? 0 : Math.PI);
        this.label(String(7 - i), s * 3.8, .16, i - 3, s === 1 ? -Math.PI / 2 : Math.PI / 2);
      }
      for (const t of [-1, 1]) {
        const corner = new T.Group(); corner.position.set(s * 3.78, .16, t * 3.78); this.root.add(corner);
        ring(corner, .12, 0, GOLD, .85); ring(corner, .16, 0, GOLD, .6);
        mesh(new T.OctahedronGeometry(.07), metal, 0, .03, 0, corner).scale.y = .3;
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const foot = mesh(new T.BoxGeometry(.7, .4, .7), darkMetal, Math.sin(a) * 4.7, -.5, Math.cos(a) * 4.7, this.root); foot.rotation.y = Math.PI / 4;
    }
  }
  private label(text: string, x: number, y: number, z: number, rotation: number) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d')!; ctx.font = '30px Georgia'; ctx.fillStyle = '#c5ad7a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 32, 32);
    const m = mesh(new T.PlaneGeometry(.22, .22), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, opacity: .7, depthWrite: false }), x, y, z, this.root);
    m.rotation.set(-Math.PI / 2, 0, rotation);
  }
  private makeHall() {
    const stone = mat(0x162023, .15, .9);
    const floor = mesh(new T.PlaneGeometry(150, 150), new T.MeshBasicMaterial({color:0x0c1215,toneMapped:false}), 0, -.78, 0, this.scene); floor.rotation.x = -Math.PI / 2;
    const ritual = new T.Group(); ritual.position.y = -.765; this.scene.add(ritual);
    [5.3, 5.45, 5.7, 6.5].forEach(r => ring(ritual, r, 0, GOLD, .14));
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI / 16;
      line(ritual, [new T.Vector3(Math.sin(a) * 5.5, 0, Math.cos(a) * 5.5), new T.Vector3(Math.sin(a + .02) * 5.8, 0, Math.cos(a + .02) * 5.8), new T.Vector3(Math.sin(a + .04) * 5.5, 0, Math.cos(a + .04) * 5.5)], GOLD, .2);
    }
    for (const x of [-9, 9]) for (const z of [-9, 0, 9]) {
      const pillar = new T.Group(); pillar.position.set(x, -.7, z); this.scene.add(pillar);
      cylinder(pillar, .7, .85, .35, .17, stone, 8); cylinder(pillar, .45, .54, 9, 4.8, stone, 12);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; mesh(new T.CylinderGeometry(.035, .035, 8.6, 6), darkMetal, Math.sin(a) * .5, 4.8, Math.cos(a) * .5, pillar); }
      cylinder(pillar, .75, .6, .3, 9.4, darkMetal, 8);
      const candle = mesh(new T.ConeGeometry(.06, .3, 8), new T.MeshBasicMaterial({ color: 0xefb46c }), x > 0 ? -.7 : .7, 2, 0, pillar);
      const flame = new T.PointLight(0xe6a45f, 2.8, 5); flame.position.copy(candle.position); pillar.add(flame);
    }
  }
  update(next: SceneState) {
    // A staged, noninteractive court portrait; never mutate a live match.
    if(!next.active){
      const king=next.pieces.find(p=>p.side==='red'&&p.role==='king');
      const masks=next.pieces.filter(p=>p.side==='blue').slice(0,2);
      next={...next,pieces:[...(king?[{...king,x:3,y:4}]:[]),...masks.map((p,i)=>({...p,x:i===0?2:4,y:2}))]};
    }
    this.dirty=true;
    this.renderer.domElement.dataset.ready='false';
    const geometryChanged=next.pieces.length!==this.state.pieces.length||next.pieces.some(p=>!this.state.pieces.some(old=>old.id===p.id&&old.role===p.role&&old.x===p.x&&old.y===p.y));
    if(geometryChanged)this.renderer.shadowMap.needsUpdate=true;
    if(next.mode==='ritual'&&(['red','blue'] as Side[]).some(side=>next.ritual?.[side].phase==='open'&&this.state.ritual?.[side].phase==='dormant'))this.riteShake=performance.now()+450;
    const tr=this.transition;
    if(tr){
      const incoming=next.pieces.find(p=>p.id===tr.id);
      // A new perspective/board must never inherit an older actor's animation.
      if(next.viewer!==this.state.viewer||!next.active||next.deployment||!incoming||incoming.role!==tr.actor.role||incoming.x!==tr.to.x+3||incoming.y!==tr.to.z+3||next.pieces.some(p=>tr.victims.some(v=>v.id===p.id)))this.cancelMove();
    }
    const previousViewer = this.state.viewer;
    if(next.viewer!==previousViewer)this.fx.clearTransient();
    if(next.viewer!==previousViewer&&this.burst){this.root.remove(this.burst.group);this.disposeGroup(this.burst.group);this.burst=null;}
    this.state = next;
    if (next.viewer && next.viewer !== previousViewer) this.desiredAngle = next.viewer === 'blue' ? Math.PI + .55 : .55;
    const ids = new Set(next.pieces.map(p => p.id));
    for (const [id, actor] of this.actors) if (!ids.has(id) && !this.transition?.victims.some(v=>v.id===id)) { this.removeActor(id,actor); }
    for (const p of next.pieces) {
      let actor = this.actors.get(p.id);
      if (!actor || actor.role !== p.role) {
        const unseal=next.mode==='ritual'&&p.revealed&&p.role==='king'&&actor?.role==='unknown';
        if (actor) { this.removeActor(p.id,actor); }
        actor = makeActor(p);if(unseal)actor.revealStarted=performance.now();this.root.add(actor.group); this.actors.set(p.id, actor);
      }
      if(next.mode!=='ritual'||next.deployment)actor.revealStarted=undefined;
      const target = new T.Vector3(p.x - 3, .18, p.y - 3);
      actor.group.userData = { x: p.x, y: p.y, actorId:p.id };
      if (actor.target.distanceTo(target) > .01) { actor.target.copy(target); actor.moving = next.reduced ? 0 : performance.now(); if ((next.reduced || next.deployment)&&this.transition?.id!==p.id) actor.group.position.copy(target); }
      if(next.viewer===null||next.deployment)actor.group.position.copy(target);
      const selected = next.selected === p.id;
      (actor.rune.material as T.MeshBasicMaterial).opacity = selected ? .95 : .25;
      const occupying=next.mode==='ritual'&&p.role==='king'&&next.ritual?.[p.side].phase==='occupied';
      (actor.rune.material as T.MeshBasicMaterial).color.setHex(p.charging?0xc1d8e5:occupying?0xd3a1ed:p.role==='martyr'?0xb394ce:p.side==='red'?RED:BLUE);
      actor.rune.scale.setScalar(occupying?1.45:selected?1.2:p.charging?1.25:1);
    }
    this.marks.children.forEach(c => this.disposeGroup(c)); this.marks.clear();
    const chosen = next.pieces.find(p => p.id === next.selected);
    if (chosen) {
      const square = mesh(new T.PlaneGeometry(.94,.94),new T.MeshBasicMaterial({color:0xe2bc70,transparent:true,opacity:.23,depthWrite:false}),chosen.x-3,.145,chosen.y-3,this.marks);
      square.rotation.x=-Math.PI/2;
    }
    for (const t of next.legal) {
      const occupied = next.pieces.some(p => p.x === t.x && p.y === t.y);
      const g = new T.Group(); g.position.set(t.x - 3, .16, t.y - 3); this.marks.add(g);
      const tint = mesh(new T.PlaneGeometry(.9,.9),new T.MeshBasicMaterial({color:occupied?0xe8a175:0xd8c68c,transparent:true,opacity:.18,depthWrite:false}),0,.002,0,g); tint.rotation.x=-Math.PI/2;
      ring(g, occupied ? .42 : .25, .005, occupied ? 0xea956b : 0xdbc58b, .95);
      if (!occupied) { const dot = mesh(new T.CircleGeometry(.06, 20), new T.MeshBasicMaterial({ color: 0xf0d49a, transparent: true, opacity: .85 }), 0, .005, 0, g); dot.rotation.x = -Math.PI / 2; }
    }
    this.fx.update(next.mode,next.ritual,next.pieces,next.preview,next.pendingCharge,next.pieces.find(p=>p.id===next.selected));
    if(next.viewer!==previousViewer){this.renderer.render(this.scene,this.camera);this.lastRender=performance.now();}

  }
  resetActors() {
    this.cancelMove();
    for(const[id,actor]of this.actors)this.removeActor(id,actor);
    this.fx.reset();
    this.actors.clear();
  }
  revealActor(id:string,role:VisibleRole){
    const old=this.actors.get(id);if(!old||old.role===role)return;
    const next=makeActor({id,role,side:old.side,x:old.group.userData.x,y:old.group.userData.y});next.group.position.copy(old.group.position);next.target.copy(old.target);
    this.removeActor(id,old);this.actors.set(id,next);this.root.add(next.group);
  }
  animateMove(id:string, role:VisibleRole, to:{x:number;y:number}, victimId?:string, reduced=false):Promise<boolean> {
    return this.animatePath(id,role,[{...to,...(victimId?{victimId}:{})}],reduced,false);
  }
  animatePath(id:string,role:VisibleRole,steps:ActionStep[],reduced=false,execution=false):Promise<boolean>{
    this.cancelMove();const actor=this.actors.get(id);if(!actor||!steps.length)return Promise.resolve(false);
    const victims=steps.flatMap((step,index)=>{const victim=step.victimId?this.actors.get(step.victimId):undefined;return victim?[{id:step.victimId!,actor:victim,index}]:[];});
    const victimId=victims[0]?.id,victim=victims[0]?.actor,to=steps.at(-1)!;
    const duration=reduced?100*steps.length:execution?1300:victimId?({king:1100,guard:850,martyr:1000,unknown:950}[role]):({king:650,guard:420,martyr:580,unknown:550}[role]);
    const restore=actor.rest;
    if(execution)this.fx.startAction(actor.group.position,steps);else if(role==='martyr')this.fx.startMartyrTrail(actor.group.position,steps);
    for(const v of victims)v.actor.model.traverse(o=>{if(o instanceof T.Mesh)for(const m of(Array.isArray(o.material)?o.material:[o.material])){m.transparent=true;m.depthWrite=false;m.needsUpdate=true;}});
    this.lastAttack=victimId||execution?{role,victimId,dissolved:false,execution,path:steps.map(p=>({...p}))}:null;
    return new Promise(finish=>{this.transition={id,role,actor,victim,victimId,victims,steps:steps.map(p=>({...p})),execution,cues:battleCues(steps.length,execution,!!victimId),emitted:new Set(),silent:false,impacts:new Set(),restore,from:actor.group.position.clone(),to:cellToWorld(to.x,to.y,.18),start:performance.now(),duration,impact:false,finish};});
  }
  cancelMove(completed=false) {
    const tr=this.transition; this.transition=null;
    if (!tr) return;
    tr.restore();
    if(this.actors.get(tr.id)===tr.actor)tr.actor.group.position.copy(tr.to);
    for(const v of tr.victims)this.removeActor(v.id,v.actor);
    this.fx.clearAction();
    tr.finish(completed);
  }
  private stepMove(now:number) {
    const tr=this.transition;if(!tr)return;
    this.dirty=true;this.renderer.shadowMap.needsUpdate = true;
    const actor=tr.actor;if(this.actors.get(tr.id)!==actor){this.cancelMove();return;}
    const global=T.MathUtils.clamp((now-tr.start)/tr.duration,0,1),path=pathProgress(global,tr.steps.length,tr.execution),index=tr.execution?path.index:0,t=tr.execution?path.t:global,attack=tr.execution||!!tr.victimId;
    for(let i=0;i<tr.cues.length;i++){const cue=tr.cues[i];if(global<cue.at||tr.emitted.has(i))continue;tr.emitted.add(i);
      if(import.meta.env.MODE==='test')this.cueLog.push({id:tr.id,kind:cue.kind,index:cue.index});
      if(cue.kind==='impact'){const at=tr.steps[cue.index!];tr.impacts.add(cue.index!);tr.impact=true;if(tr.execution)this.fx.impact(at.x,at.y);else this.effect(at.x,at.y,tr.role);}
      if(tr.execution&&!tr.silent)this.onBattleCue?.(`execution-${cue.kind}`);
    }
    const step=tr.steps[index],destination=cellToWorld(step.x,step.y,.18),from=index?cellToWorld(tr.steps[index-1].x,tr.steps[index-1].y,.18):tr.from;
    const progress=tr.execution?T.MathUtils.smoothstep(t,0,1):attack?T.MathUtils.smoothstep(t,.32,.95):T.MathUtils.smoothstep(t,0,1);
    actor.group.position.lerpVectors(from,destination,progress);
    const pulse=Math.sin(Math.PI*t);
    actor.model.position.y=tr.role==='martyr'?pulse*.17:tr.role==='guard'?pulse*.05:pulse*.025;
    actor.model.rotation.z=tr.role==='guard'?-pulse*.07:0;
    if(actor.rig){
      actor.rig.weapon.rotation.z=(tr.role==='guard'?-.13:0)+(attack?Math.sin(t*Math.PI*2)*(tr.role==='guard'?1.15:tr.role==='king'?-.28:.18):0);
      actor.rig.cape.rotation.x=pulse*(tr.role==='guard'?.12:.04);
      actor.rig.leftArm.rotation.z=attack?pulse*.035:0;
      actor.rig.rightArm.rotation.z=attack?-pulse*.035:0;
      actor.rig.seal.scale.setScalar(1+pulse*.6);
    }
    if(tr.execution||tr.role==='martyr')this.fx.stepAction(global,actor.group.position,Math.sign(tr.to.z-tr.from.z));
    for(const v of tr.victims){const hit=impactAt(v.index,tr.steps.length,tr.execution),fade=T.MathUtils.smoothstep(global,hit,Math.min(1,hit+(tr.execution?.16:.46)));if(global>=hit){v.actor.group.scale.setScalar(Math.max(.001,1-fade));v.actor.model.rotation.y=v.actor.side==='red'?0:Math.PI;v.actor.model.traverse(o=>{if(o instanceof T.Mesh)for(const m of(Array.isArray(o.material)?o.material:[o.material]))m.opacity=1-fade;});}}
    if(global>=1){
      actor.group.position.copy(tr.to);actor.model.position.y=0;actor.model.rotation.z=0;
      if(actor.rig){actor.rig.weapon.rotation.z=tr.role==='guard'?-.13:0;actor.rig.cape.rotation.x=0;actor.rig.leftArm.rotation.z=actor.rig.rightArm.rotation.z=0;actor.rig.seal.scale.setScalar(1);}
      if(this.lastAttack)this.lastAttack.dissolved=true;
      this.cancelMove(true);
    }
  }
  effect(x: number, y: number, role: VisibleRole) {
    if (this.burst) { this.root.remove(this.burst.group); this.disposeGroup(this.burst.group); }
    const group = new T.Group(); group.position.set(x - 3, .2, y - 3); this.root.add(group);
    const color = role === 'king' ? 0xeec881 : role === 'guard' ? 0xd1e2e5 : 0xb591e0;
    if(role==='guard'){
      for(let i=0;i<3;i++){const slash=mesh(new T.TorusGeometry(.45+i*.12,.013-i*.003,4,48,Math.PI*1.4),new T.MeshBasicMaterial({color,transparent:true,opacity:.9}),0,.35+i*.09,0,group);slash.rotation.set(.35,i*.5,Math.PI*.3);}
    }else if(role==='martyr'){
      ring(group,.46,.04,color,.9);ring(group,.55,.04,0xd8b676,.7);
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3,b=a+Math.PI*4/3;line(group,[new T.Vector3(Math.sin(a)*.48,.06,Math.cos(a)*.48),new T.Vector3(Math.sin(b)*.48,.06,Math.cos(b)*.48)],color,.9);}
    }else{ring(group,.28,.03,color,.95);ring(group,.44,.05,color,.7);ring(group,.6,.08,color,.5);}

    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12, m = mesh(new T.OctahedronGeometry(.035 + Math.random() * .035), new T.MeshBasicMaterial({ color, transparent: true }), Math.sin(a) * .2, Math.random() * .5, Math.cos(a) * .2, group);
      m.userData.velocity = new T.Vector3(Math.sin(a), .5 + Math.random(), Math.cos(a));
    }
    this.burst = { group, start: performance.now() };
  }
  rotate() { this.desiredAngle += Math.PI / 2; }
  setZoom(value: number) { this.desiredZoom = value; }
  resetCamera() { this.desiredAngle = this.state.viewer === 'blue' ? Math.PI + .55 : .55; this.desiredZoom = 1; }
  syncLayout() { this.resize(); }
  layoutReady() {
    const c=this.renderer.domElement,r=c.getBoundingClientRect(),h=this.host.getBoundingClientRect();
    return Math.abs(r.width-h.width)<1&&Math.abs(r.height-h.height)<1&&Math.abs(this.camera.aspect-this.host.clientWidth/this.host.clientHeight)<.002;
  }
  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h || (w===this.measuredWidth && h===this.measuredHeight)) return;
    this.dirty=true;this.measuredWidth=w;this.measuredHeight=h;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  private pointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || (e.button !== 0 && e.button !== 2)) return;
    this.down = { x: e.clientX, y: e.clientY, id: e.pointerId, button: e.button };
    this.dragging = e.button === 2;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };
  private pointerMove = (e: PointerEvent) => {
    if (this.down?.id !== e.pointerId) return;
    if (this.dragging) { this.desiredAngle += (e.clientX - this.down.x) * .008; this.down.x = e.clientX; }
  };
  private pointerCancel = () => { this.down = null; this.dragging = false; };
  private pointerUp = (e: PointerEvent) => {
    const down = this.down; this.down = null;
    if (!down || down.id !== e.pointerId) return;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) this.renderer.domElement.releasePointerCapture(e.pointerId);
    if (this.dragging || down.button !== 0) { this.dragging = false; return; }
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    const ndc = clientToNDC(e.clientX, e.clientY, this.renderer.domElement.getBoundingClientRect());
    if (!ndc) return;
    this.camera.updateMatrixWorld(true); this.root.updateMatrixWorld(true);
    this.ray.setFromCamera(ndc, this.camera);
    // Intersect ONLY the dedicated body surfaces and the exact board plane.
    // Three.Line's default 1-world-unit tolerance must never enter picking.
    const bodies = Array.from(this.actors.values(), a => a.pick);
    const hit = this.ray.intersectObjects(bodies, false)[0];
    if(import.meta.env.MODE==='test') this.debugInput={rect:this.renderer.domElement.getBoundingClientRect().toJSON(),ndc:ndc.toArray(),bodies:bodies.map(m=>({world:m.getWorldPosition(new T.Vector3()).toArray(),cell:m.parent?.userData})),hits:this.ray.intersectObjects(bodies,false).map(h=>({cell:h.object.parent?.userData,point:h.point.toArray()}))};
    const body = hit?.object.parent?.userData;
    const cell = resolvePick(intersectBoard(this.ray.ray),body?.x!==undefined?{x:body.x,y:body.y}:null,this.state.legal,this.state.selected);
    if (cell) { this.lastHit = { ...cell, source: body?.x !== undefined ? 'body' : 'cell' }; this.onCell(cell.x, cell.y); }
  };
  projectActor(id:string,height=1.4){const actor=this.actors.get(id);if(!actor)return null;this.camera.updateMatrixWorld(true);const v=actor.group.position.clone();v.y+=height;v.project(this.camera);const r=this.renderer.domElement.getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};}
  projectCell(x: number, y: number, height = .14) {
    this.camera.updateMatrixWorld(true);
    const p = cellToWorld(x, y, height).project(this.camera), r = this.renderer.domElement.getBoundingClientRect();
    if(import.meta.env.MODE==='test')this.debugProject={x,y,height,p:p.toArray(),r:r.toJSON(),position:this.camera.position.toArray(),aspect:this.camera.aspect,zoom:this.zoom,angle:this.angle};
    return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
  }
  private contextMenu = (e: Event) => e.preventDefault();
  private animate = () => {
    if (this.dead) return;
    this.frame = requestAnimationFrame(this.animate);
    const now = performance.now(), dt = Math.min((now - this.last) / 1000, .05); this.last = now;
    // Full privacy/result covers have no interactive 3D content. Stop their
    // hidden GPU work so DOM/SVG ending animation can use the compositor freely.
    if(this.state.viewer===null&&this.state.active){this.lastCamera=now;this.dirty=false;return;}
    const speed = this.state.reduced ? 1 : 1 - Math.exp(-Math.min((now-this.lastCamera)/1000,.25) * 7); this.lastCamera=now;
    this.angle += (this.desiredAngle - this.angle) * speed; this.zoom += (this.desiredZoom - this.zoom) * speed;
    const aspect = this.camera.aspect, fit = aspect < .85 ? 1.28 : aspect < 1.1 ? 1.12 : 1;
    let distance = (this.state.active ? 14.7 : 10.8) * fit / this.zoom;
    if (this.burst && this.state.cinematic && !this.state.reduced) distance -= Math.sin(Math.min((now - this.burst.start) / 1000, 1) * Math.PI) * .65;
    if(this.transition?.execution&&this.state.cinematic&&!this.state.reduced){const p=T.MathUtils.clamp((now-this.transition.start)/this.transition.duration,0,1);distance-=Math.sin(p*Math.PI)*.35;}
    this.camera.position.set(Math.sin(this.angle) * distance * .78, distance * .83, Math.cos(this.angle) * distance * .78); this.camera.lookAt(0, -.05, 0);
    if(this.state.active){
      for(let iteration=0;iteration<3;iteration++){
        this.camera.updateMatrixWorld(true);let overflow=1;
        for(const x of [-3.6,3.6])for(const z of [-3.6,3.6])for(const y of [.05,1.85]){
          const p=new T.Vector3(x,y,z).project(this.camera);overflow=Math.max(overflow,Math.abs(p.x)/.94,Math.abs(p.y)/.82);
        }
        if(overflow<=1.002)break;distance*=overflow*1.01;
        this.camera.position.set(Math.sin(this.angle)*distance*.78,distance*.83,Math.cos(this.angle)*distance*.78);this.camera.lookAt(0,-.05,0);
      }
    }
    if(!this.state.reduced&&now<this.riteShake){this.camera.position.x+=Math.sin(now*.065)*.025*(this.riteShake-now)/450;this.camera.lookAt(0,-.05,0);}
    for (const [id, actor] of this.actors) {
      const piece=this.state.pieces.find(p=>p.id===id);
      if(actor.rig&&this.transition?.id!==id)actor.rig.weapon.rotation.z=piece?.charging||this.state.pendingCharge===id?-.65:actor.role==='guard'?-.13:0;
      if(actor.revealStarted){const t=(now-actor.revealStarted)/1200;if(t<1&&!this.state.reduced){actor.rune.scale.setScalar(1+Math.sin(t*Math.PI)*1.1);(actor.rune.material as T.MeshBasicMaterial).opacity=.4+Math.sin(t*Math.PI)*.6;}else{actor.revealStarted=undefined;actor.rune.scale.setScalar(this.state.selected===id?1.2:1);(actor.rune.material as T.MeshBasicMaterial).opacity=this.state.selected===id?.95:.25;}}
      const d = actor.group.position.distanceTo(actor.target);
      if(this.transition?.id===id||this.transition?.victims.some(v=>v.id===id)) continue;
      actor.group.position.lerp(actor.target, this.state.reduced ? 1 : 1 - Math.exp(-dt * 10));
      actor.model.position.y = this.state.reduced ? 0 : Math.sin(now * .0018 + actor.target.x) * .012 + (d > .02 ? Math.min(d * .2, .12) : 0);
      if(actor.rig&&!this.state.reduced){
        const wave=Math.sin(now*.0017+actor.target.x);
        actor.rig.cape.rotation.x=wave*.012;
        actor.rig.weapon.rotation.z=((piece?.charging||this.state.pendingCharge===id)?-.65:actor.role==='guard'?-.13:0)+wave*.007;
        if(actor.role==='martyr'){actor.rig.seal.rotation.z=now*.00012;actor.rig.seal.position.y=1.20+wave*.015;}
      }
      actor.rune.rotation.z += this.state.reduced ? 0 : dt * .12;
    }
    const actionTime=import.meta.env.MODE==='test'&&this.debugActionProgress!==null&&this.transition?this.transition.start+this.transition.duration*this.debugActionProgress:now;
    this.stepMove(actionTime);
    this.fx.tick(now,this.state.reduced,this.actors);
    if (this.burst) {
      const age = (now - this.burst.start) / 1000;
      this.burst.group.children.forEach(c => {
        const m = c as T.Mesh | T.Line;
        if (m.userData.velocity) { m.position.addScaledVector(m.userData.velocity, dt * 1.9); m.rotation.x += dt * 3; m.rotation.y += dt; }
        else m.scale.setScalar(1 + age * 3);
        (m.material as T.MeshBasicMaterial).opacity = Math.max(0, 1 - age);
      });
      if (age > 1.1) { this.root.remove(this.burst.group); this.disposeGroup(this.burst.group); this.burst = null; }
    }
    if (!this.state.reduced) this.particles.rotation.y += dt * .007;
    const ready=String(this.layoutReady()&&Math.abs(this.angle-this.desiredAngle)<.0008&&Math.abs(this.zoom-this.desiredZoom)<.001);
    if(this.renderer.domElement.dataset.ready!==ready)this.renderer.domElement.dataset.ready=ready;
    const moving=!!this.transition||!!this.burst||this.fx.transients.length>0||ready==='false';
    if (!document.hidden&&(this.dirty||moving||(!this.state.reduced&&now-this.lastRender>33))){
      this.renderer.render(this.scene,this.camera);this.lastRender=now;this.dirty=false;
    }
  };
  skipMove(){if(!this.transition)return;this.transition.silent=true;this.stepMove(this.transition.start+this.transition.duration+1);}
  private removeActor(id:string,actor:Actor){
    // A stale animation may only release the exact instance it owns. Never an
    // actor with the same ID from a new perspective or a restarted match.
    if(this.actors.get(id)!==actor||actor.disposed)return;actor.disposed=true;actor.group.removeFromParent();this.actors.delete(id);this.disposeGroup(actor.group);
  }
  private disposeGroup(g: T.Object3D) {
    g.traverse(o => { if (o instanceof T.Mesh || o instanceof T.Line) { if(!o.geometry?.userData.shared)o.geometry?.dispose(); const materials = Array.isArray(o.material) ? o.material : [o.material]; for (const m of materials) if (!m.userData.shared && m !== metal && m !== darkMetal && m !== obsidian) { for(const value of Object.values(m))if(value instanceof T.Texture&&!value.userData.shared)value.dispose(); m.dispose(); } } });
  }
  destroy() {
    this.cancelMove(); this.dead = true; cancelAnimationFrame(this.frame); this.observer.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown); this.renderer.domElement.removeEventListener('pointerup', this.pointerUp); this.renderer.domElement.removeEventListener('pointermove', this.pointerMove); this.renderer.domElement.removeEventListener('contextmenu', this.contextMenu);
    this.renderer.domElement.removeEventListener('pointercancel', this.pointerCancel);
    this.renderer.domElement.removeEventListener('lostpointercapture', this.pointerCancel);
    this.fx.destroy();this.disposeGroup(this.scene); disposeCharacters(); this.environment.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
