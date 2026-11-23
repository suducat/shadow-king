import * as T from 'three';
import {QUALITY,type Quality} from './quality';
import {BoardMarks} from './board-marks';
import {RigidBatches} from './rigid-batches';
import {renderResolution} from './render-resolution';
import {surface,disposeSurfaces,setSurfaceSampling} from './surfaces';
import {BattleEffects} from './battle-effects';
import {BoardInk} from './board-ink';
import type {FallenMeshMessage} from './fallen.worker';
import {battleTimeline,consumeCues,sampleBattle,drawStance,drawStart,drawSpan,retirementPose,disclosureDelay,neutralPose,smooth,clamp,type BattleCue,type Timeline,type PublicBeats} from './battle-timeline';
import type {CueOptions} from './audio';
import type { Role, Side, VisiblePiece, VisibleRole,Capture } from './game';
import {type GameMode,type Rites,type ActionStep} from './ritual';
import { buildFallenMesh,createCharacter,disposeCharacters,poseFigure,type CharacterRig,type FallenMeshData } from './models';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { bodyPickMesh, cellToWorld, clientToNDC, intersectBoard,resolvePick } from './interaction';

type SceneState = { pieces: VisiblePiece[]; selected: string | null; legal: { x: number; y: number }[]; viewer: Side | null; cinematic: boolean; reduced: boolean; deployment: boolean; active: boolean; mode?:GameMode; ritual?:Rites; preview?:ActionStep[]; pendingCharge?:string|null };
type Unseal={start:number;color:number;surfaces:Map<T.MeshStandardMaterial,{color:T.Color;intensity:number}>};
type Actor = { group: T.Group; model: T.Group; rune: T.Mesh; role: VisibleRole; side: Side; target: T.Vector3; moving: number; pick: T.Mesh; rig?: CharacterRig; unseal?:Unseal; publicIdentity:boolean; rest:()=>void; materials:ReadonlySet<T.Material>; disposed:boolean;facing:number };
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
function makeActor(p: VisiblePiece,quality:Quality): Actor {
  const group=new T.Group(),{model,pick,rig}=createCharacter(p.role,p.side,quality);
  group.add(model,pick);
  const shadow=mesh(new T.CircleGeometry(.345,24),new T.MeshBasicMaterial({color:0x05090c,transparent:true,opacity:.32,depthWrite:false}),0,.003,0,group);shadow.rotation.x=-Math.PI/2;
  const contact=mesh(new T.RingGeometry(.345,.39,24),new T.MeshBasicMaterial({color:0x080d10,transparent:true,opacity:.13,depthWrite:false}),0,.002,0,group);contact.rotation.x=-Math.PI/2;
  const rune=ring(group,.37,.025,p.role==='martyr'?0xb394ce:p.side==='red'?RED:BLUE,.35);
  group.position.copy(cellToWorld(p.x,p.y,.18));
  const parts=[model,...Object.values(rig??{})],poses=parts.map(part=>({part,position:part.position.clone(),rotation:part.rotation.clone(),scale:part.scale.clone()}));
  const materials=new Map<T.Material,{opacity:number;transparent:boolean;depthWrite:boolean}>();model.traverse(o=>{if(o instanceof T.Mesh)for(const m of(Array.isArray(o.material)?o.material:[o.material]))materials.set(m,{opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite});});
  const rest=()=>{group.scale.setScalar(1);group.visible=true;for(const p of poses){p.part.visible=true;p.part.position.copy(p.position);p.part.rotation.copy(p.rotation);p.part.scale.copy(p.scale);}model.traverse(o=>{if(o instanceof T.Mesh)o.visible=true;});for(const[m,r]of materials){const changed=m.transparent!==r.transparent||m.depthWrite!==r.depthWrite;m.opacity=r.opacity;m.transparent=r.transparent;m.depthWrite=r.depthWrite;if(changed)m.needsUpdate=true;}};
  group.userData={x:p.x,y:p.y,actorId:p.id};
  return {group,model,pick,rig,rune,role:p.role,side:p.side,target:group.position.clone(),moving:0,rest,materials:new Set(materials.keys()),disposed:false,facing:0,publicIdentity:false};
}

type Victim={id:string;actor:Actor;index:number;at:T.Vector3;disclosed:boolean;fracture?:T.Group;};
type Motion={id:string;victimId?:string;role:VisibleRole;actor:Actor;victim?:Actor;victims:Victim[];steps:ActionStep[];segments:{from:T.Vector3;to:T.Vector3;direction:T.Vector3}[];execution:boolean;cues:BattleCue[];emitted:Set<number>;silent:boolean;impacts:Set<number>;restore:()=>void;from:T.Vector3;to:T.Vector3;start:number;duration:number;impact:boolean;finish:(completed:boolean)=>void;line:Timeline;publicBeats:PublicBeats;pendingState?:SceneState;beforeRites?:Rites;beforePieces:VisiblePiece[];ceremonyCommitted:boolean;lastProgress:number;fromFacing:number;goalFacing:number;groupKey:string;startLift:number};
let sceneSerial=0;
const shortAngle=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
export class BoardScene {
  renderer: T.WebGLRenderer;
  quality:Quality='medium';private pendingQuality:Quality|null=null;private keyLight!:T.DirectionalLight;private labelMaterial?:T.MeshBasicMaterial;
  environment: T.WebGLRenderTarget;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(36, 1, .1, 100);
  root = new T.Group();
  actors = new Map<string, Actor>();
  tiles: T.Mesh[] = [];
  marks = new T.Group();
  fallen = new T.Group();
  private fallenKeys:string[] = [];
  private fallenMeshes=new Map<Role,T.BufferGeometry>();
  private fallenWorker?:Worker;
  get fallenMeshesReady(){return this.fallenMeshes.size;}
  private boardMarks=new BoardMarks(this.marks);
  batches=new RigidBatches(this.root);
  batchingEnabled=true;
  private measuredDensity=0;private displayDensity=0;bufferResizes=0;
  particles: T.Points;
  ray = new T.Raycaster();
  pointer = new T.Vector2();
  state: SceneState = { pieces: [], selected: null, legal: [], viewer: 'red', cinematic: true, reduced: false, deployment: false, active: false };
  frame = 0;
  renderedFrames = 0;
  fx:BattleEffects;
  private ink:BoardInk;
  onBoardContact:((actor:string,step:ActionStep,rites:Rites|undefined,reveals:PublicBeats['reveals'])=>void)|null=null;
  onBattleCue:((kind:string,options?:CueOptions)=>void)|null=null;
  onBattleCancel:((group:string)=>void)|null=null;onPublicCapture:((capture:Capture)=>void)|null=null;
  lastSkipped=false;private instance=++sceneSerial;private actionSerial=0;private ceremonySerial=0;private audioQueue:{kind:string;options:CueOptions;at:number}[]=[];private cameraImpulse:{at:number;direction:T.Vector3}|null=null;private cameraBase=new T.Vector3();
  private executionShade=document.createElement('div');
  private executionLamp=new T.PointLight(0xe7f5ff,0,4,2);
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
  transition:Motion|null=null;
  lastAttack: {role:VisibleRole; victimId?:string; dissolved:boolean;execution?:boolean;path?:ActionStep[]} | null = null;
  private dirty = true; private lastRender=0;
  private dead = false;
  private layoutSuspended=false;
  private measuredWidth = 0; private measuredHeight = 0;
  private last = performance.now();
  private lastCamera = performance.now();
  private touches=new Map<number,T.Vector2>();
  private pinch?:{span:number;zoom:number};
  private cameraFitKey = "";
  private cameraFitDistance = 0;
  private lastMotionShadow=-Infinity;
  constructor(public host: HTMLElement, onCell: (x: number, y: number) => void) {
    this.onCell = onCell;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    const gl=this.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    this.batchingEnabled=!/SwiftShader|llvmpipe|softpipe/i.test(debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):'');
    setSurfaceSampling(Math.min(this.renderer.capabilities.getMaxAnisotropy(),QUALITY[this.quality].anisotropy));
    this.renderer.shadowMap.enabled = false; this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace; this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.setAttribute('aria-label', '可交互的三维魔法棋盘，点击己方棋子，再点击亮起的合法格子');
    this.renderer.domElement.setAttribute('role', 'img');
    host.appendChild(this.renderer.domElement);
    this.ink=new BoardInk(host);
    this.executionShade.className='execution-shade';
    this.executionShade.setAttribute('aria-hidden','true');
    document.body.appendChild(this.executionShade);
    this.executionLamp.intensity=0;
    this.root.add(this.executionLamp);
    const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();
    this.environment=pmrem.fromScene(room,.04,.1,100,{size:128});this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.8;
    room.dispose();pmrem.dispose();
    this.scene.fog = new T.FogExp2(0x0b1319, .024);
    this.scene.add(this.root); this.root.add(this.marks,this.fallen);this.fx=new BattleEffects(this.root);
    this.scene.add(new T.AmbientLight(0xa6bdca, .92));
    const key = new T.DirectionalLight(0xffe3be, 3.1); key.position.set(-4, 12, 7); key.castShadow = true;this.keyLight=key;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7; key.shadow.normalBias = .035; this.scene.add(key);
    const cold = new T.DirectionalLight(0x7cc0e3, 2.4); cold.position.set(5, 5, -7); this.scene.add(cold);
    const rim = new T.PointLight(0xa3bed2, 8, 18); rim.position.set(-6, 3, -4); this.scene.add(rim);
    this.makeBoard(); this.makeHall();
    this.scene.onBeforeRender=()=>{
      if(!this.batchingEnabled)return;
      this.batches.sync([...this.actors].map(([id,actor])=>({
        id,model:actor.model,
        // Public opponents keep the same draw path before, during and after
        // acting. A renderer batch must not take ownership of their meshes.
        exclude:actor.disposed||!!actor.unseal||
          (actor.publicIdentity&&actor.side!==this.state.viewer)||
          this.transition?.id===id||!!this.transition?.victims.some(v=>v.actor===actor),
      })),true);
    };
    this.scene.onAfterRender=()=>this.batches.restore();
    const positions = new Float32Array(100 * 3);
    for (let i = 0; i < 100; i++) { positions[i * 3] = (Math.random() - .5) * 22; positions[i * 3 + 1] = Math.random() * 7; positions[i * 3 + 2] = (Math.random() - .5) * 18; }
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(positions, 3));
    pg.setDrawRange(0,QUALITY[this.quality].particles);
    this.particles = new T.Points(pg, new T.PointsMaterial({ color: 0xd5b782, size: .018, transparent: true, opacity: .38, depthWrite: false, blending: T.AdditiveBlending })); this.scene.add(this.particles);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host); this.resize();
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
    this.renderer.domElement.addEventListener('pointermove', this.pointerMove);
    this.renderer.domElement.addEventListener('contextmenu', this.contextMenu);
    this.renderer.domElement.addEventListener('pointercancel', this.pointerCancel);
    this.renderer.domElement.addEventListener('lostpointercapture', this.pointerCancel);
    this.prepareFallenMeshes();
    this.animate();
  }
  private makeBoard() {
    const board=new T.Group();this.root.add(board);
    const texture = surface('stone',true),relief=surface('stone');
    const stone = mat(0x283b43, .05, .88); stone.map = texture; stone.bumpMap=relief;stone.roughnessMap=relief; stone.bumpScale=.012;
    const pale = mat(0xa9a28f, .03, .86); pale.map = texture; pale.bumpMap=relief;pale.roughnessMap=relief; pale.bumpScale=.01;
    mesh(new T.BoxGeometry(8.1, .35, 8.1), mat(0x242e2f, .5, .6), 0, -.2, 0, board);
    mesh(new T.BoxGeometry(7.8, .16, 7.8), darkMetal, 0, .005, 0, board);
    for(const parity of [0,1]){const cells=Array.from({length:49},(_,i)=>({x:i%7,y:Math.floor(i/7)})).filter(p=>(p.x+p.y)%2===parity),tiles=new T.InstancedMesh(new T.BoxGeometry(.98,.15,.98),parity?stone:pale,cells.length),matrix=new T.Matrix4();cells.forEach((p,i)=>tiles.setMatrixAt(i,matrix.makeTranslation(p.x-3,.065,p.y-3)));tiles.receiveShadow=true;board.add(tiles);this.tiles.push(tiles);}
    for (const s of [-1, 1]) {
      mesh(new T.BoxGeometry(8.05, .065, .035), metal, 0, .1, s * 3.98, board);
      mesh(new T.BoxGeometry(.035, .065, 8.05), metal, s * 3.98, .1, 0, board);
      mesh(new T.BoxGeometry(7.3, .025, .025), metal, 0, .15, s * 3.63, board);
      mesh(new T.BoxGeometry(.025, .025, 7.3), metal, s * 3.63, .15, 0, board);
      for (let i = 0; i < 7; i++) {
        this.label('ABCDEFG'[i], i - 3, .16, s * 3.8, s === 1 ? 0 : Math.PI,board);
        this.label(String(7 - i), s * 3.8, .16, i - 3, s === 1 ? -Math.PI / 2 : Math.PI / 2,board);
      }
      for (const t of [-1, 1]) {
        const corner = new T.Group(); corner.position.set(s * 3.78, .16, t * 3.78); board.add(corner);
        ring(corner, .12, 0, GOLD, .85); ring(corner, .16, 0, GOLD, .6);
        mesh(new T.OctahedronGeometry(.07), metal, 0, .03, 0, corner).scale.y = .3;
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const foot = mesh(new T.BoxGeometry(.7, .4, .7), darkMetal, Math.sin(a) * 4.7, -.5, Math.cos(a) * 4.7, board); foot.rotation.y = Math.PI / 4;
    }
    this.batchStatic(board);
  }
  private label(text:string,x:number,y:number,z:number,rotation:number,parent:T.Group){
    const glyphs='ABCDEFG7654321';
    if(!this.labelMaterial){const c=document.createElement('canvas');c.width=64*glyphs.length;c.height=64;const ctx=c.getContext('2d')!;ctx.font='30px Georgia';ctx.fillStyle='#d7bc82';ctx.textAlign='center';ctx.textBaseline='middle';for(let i=0;i<glyphs.length;i++)ctx.fillText(glyphs[i],i*64+32,32);this.labelMaterial=new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,opacity:.85,depthWrite:false});}
    const geo=new T.PlaneGeometry(.22,.22),uv=geo.getAttribute('uv'),index=glyphs.indexOf(text);for(let i=0;i<uv.count;i++)uv.setX(i,(uv.getX(i)+index)/glyphs.length);
    const m=mesh(geo,this.labelMaterial,x,y,z,parent);m.rotation.set(-Math.PI/2,0,rotation);
  }
  private batchStatic(group:T.Group){
    group.updateMatrixWorld(true);const groups=new Map<T.Material,T.Mesh[]>();group.traverse(o=>{if(o instanceof T.Mesh&&!(o instanceof T.InstancedMesh)&&!Array.isArray(o.material)){const list=groups.get(o.material)??[];list.push(o);groups.set(o.material,list);}});
    for(const[material,objects]of groups){if(objects.length<2)continue;const inverse=group.matrixWorld.clone().invert(),geometries=objects.map(o=>{const raw=o.geometry.clone(),g=raw.index?raw.toNonIndexed():raw;if(g!==raw)raw.dispose();return g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld));});const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!merged)continue;for(const o of objects){o.removeFromParent();o.geometry.dispose();}mesh(merged,material,0,0,0,group);}
  }
  private makeHall() {
    const stone = mat(0x1d2b32, .04, .94);stone.bumpMap=surface('stone');stone.bumpScale=.035;
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!,fade=ctx.createRadialGradient(64,64,4,64,64,64);fade.addColorStop(0,'white');fade.addColorStop(.55,'#777');fade.addColorStop(1,'black');ctx.fillStyle=fade;ctx.fillRect(0,0,128,128);
    const floor = mesh(new T.PlaneGeometry(32,32),new T.MeshStandardMaterial({color:0x162731,roughness:.97,metalness:.02,envMapIntensity:.15,transparent:true,opacity:.3,alphaMap:new T.CanvasTexture(c),depthWrite:false}),0,-.78,0,this.scene);floor.rotation.x=-Math.PI/2;
    const ritual = new T.Group(); ritual.position.y = -.765; this.scene.add(ritual);
    [5.3, 5.45, 5.7, 6.5].forEach(r => ring(ritual, r, 0, GOLD, .14));
    const glyphLines:T.Vector3[]=[];for(let i=0;i<32;i++){const a=i*Math.PI/16,p=new T.Vector3(Math.sin(a)*5.5,0,Math.cos(a)*5.5),q=new T.Vector3(Math.sin(a+.02)*5.8,0,Math.cos(a+.02)*5.8),r=new T.Vector3(Math.sin(a+.04)*5.5,0,Math.cos(a+.04)*5.5);glyphLines.push(p,q,q,r);}ritual.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(glyphLines),new T.LineBasicMaterial({color:GOLD,transparent:true,opacity:.2,depthWrite:false})));
    const columns=new T.Group();this.scene.add(columns);
    for (const x of [-9, 9]) for (const z of [-9, 0, 9]) {
      const pillar = new T.Group(); pillar.position.set(x, -.7, z); columns.add(pillar);
      cylinder(pillar, .7, .85, .35, .17, stone, 8); cylinder(pillar, .45, .54, 9, 4.8, stone, 12);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; mesh(new T.CylinderGeometry(.035, .035, 8.6, 6), darkMetal, Math.sin(a) * .5, 4.8, Math.cos(a) * .5, pillar); }
      cylinder(pillar, .75, .6, .3, 9.4, darkMetal, 8);
      const candle = mesh(new T.ConeGeometry(.06, .3, 8), new T.MeshBasicMaterial({ color: 0xefb46c }), x > 0 ? -.7 : .7, 2, 0, pillar);
      const flame = new T.PointLight(0xe6a45f, 2.8, 5); flame.position.copy(candle.position); flame.userData.decorativeLight=true;flame.visible=this.quality==='high';pillar.add(flame);
    }
    this.batchStatic(columns);
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
    const tr=this.transition;
    if(tr){
      const incoming=next.pieces.find(p=>p.id===tr.id);
      // A new perspective/board must never inherit an older actor's animation.
      if(next.viewer!==this.state.viewer||!next.active||next.deployment||!incoming||incoming.role!==tr.actor.role||incoming.x!==tr.to.x+3||incoming.y!==tr.to.z+3||next.pieces.some(p=>tr.victims.some(v=>v.id===p.id)))this.cancelMove();
    }
    const previousViewer = this.state.viewer;
    if(next.viewer!==previousViewer||next.active!==this.state.active||next.reduced!==this.state.reduced){
      this.fx.clearTransient();this.ink.clear();
    }
    if(next.viewer!==previousViewer&&this.burst){this.root.remove(this.burst.group);this.disposeGroup(this.burst.group);this.burst=null;}
    this.state = next;
    if (next.viewer && next.viewer !== previousViewer) this.desiredAngle = next.viewer === 'blue' ? Math.PI + .55 : .55;
    const ids = new Set(next.pieces.map(p => p.id));
    for (const [id, actor] of this.actors) if (!ids.has(id) && !this.transition?.victims.some(v=>v.id===id)) { this.removeActor(id,actor); }
    for (const p of next.pieces) {
      let actor = this.actors.get(p.id);
      const deferred=this.transition?.publicBeats.reveals.some(r=>r.id===p.id&&!this.transition!.impacts.has(r.step));
      if ((!actor || actor.role !== p.role)&&!deferred) {
        if (actor) { this.removeActor(p.id,actor); }
        actor = makeActor(p,this.quality);this.root.add(actor.group); this.actors.set(p.id, actor);
      }
      if(!actor)continue;
      if(p.revealed&&!deferred)this.keepPublicModel(actor);
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
    this.boardMarks.update(next.pieces.find(p=>p.id===next.selected),next.legal.map(p=>({...p,occupied:next.pieces.some(q=>q.x===p.x&&q.y===p.y)})));
    if(this.transition)this.transition.pendingState=next;
    this.syncEffects(next,this.transition&&!this.transition.ceremonyCommitted?this.transition.beforeRites:next.ritual,performance.now());
    // Reconcile first; one RAF renders after camera and matrices are settled.

  }
  setBatching(enabled:boolean){if(enabled===this.batchingEnabled)return;this.batches.clear();this.batchingEnabled=enabled;this.dirty=true;}
  setQuality(value:Quality){
    if(value===this.quality&&!this.pendingQuality)return;
    // Defer mesh replacement until the active animation has settled. Changing
    // settings must never cancel a move or release an actor still in use.
    this.pendingQuality=value;this.applyQuality();
  }
  private applyQuality(){
    if(!this.pendingQuality||this.transition)return;
    this.quality=this.pendingQuality;this.pendingQuality=null;const q=QUALITY[this.quality];
    this.batches.clear();setSurfaceSampling(Math.min(this.renderer.capabilities.getMaxAnisotropy(),q.anisotropy));this.measuredDensity=0;
    this.renderer.shadowMap.enabled=!!q.shadow;
    if(q.shadow){this.keyLight.shadow.mapSize.set(q.shadow,q.shadow);this.keyLight.shadow.map?.dispose();this.keyLight.shadow.map=null;this.renderer.shadowMap.needsUpdate=true;}
    this.scene.traverse(o=>{if(o.userData.decorativeLight)o.visible=this.quality==='high';});
    this.particles.geometry.setDrawRange(0,q.particles);this.fx.setQuality(this.quality==='low');
    for(const[id,actor]of this.actors)this.removeActor(id,actor);
    this.update(this.state);this.resize();this.dirty=true;
  }
  private prepareFallenMeshes(){
    try {
      const worker=new Worker(new URL('./fallen.worker.ts',import.meta.url),{type:'module'});
      this.fallenWorker=worker;
      const close=()=>{worker.terminate();if(this.fallenWorker===worker)this.fallenWorker=undefined;};
      worker.onmessage=({data}:MessageEvent<FallenMeshMessage>)=>{
        if(this.dead||this.fallenWorker!==worker)return;
        this.cacheFallenMesh(data.role,data);
        if(this.fallenMeshes.size===3)close();
      };
      worker.onerror=close;
    }catch { /* blocked worker: build a missing asset once on demand */ }
  }
  private cacheFallenMesh(role:Role,data:FallenMeshData){
    const cached=this.fallenMeshes.get(role);
    if(cached)return cached;
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(data.positions,3));
    geometry.setIndex(new T.BufferAttribute(data.indices,1));
    geometry.userData.shared=true;
    this.fallenMeshes.set(role,geometry);
    return geometry;
  }
  setFallen(captures:readonly Capture[]){
    const keys=captures.map(({side,role})=>side+'/'+role);
    let common=0;
    while(common<keys.length&&keys[common]===this.fallenKeys[common])common++;
    if(common===keys.length&&common===this.fallenKeys.length)return;
    this.fallenKeys=keys;
    for(const spirit of this.fallen.children.slice(common)){
      this.disposeGroup(spirit);spirit.removeFromParent();
    }
    const slots={red:0,blue:0};
    for(const {side} of captures.slice(0,common))slots[side]++;
    for(const {side,role} of captures.slice(common)){
      const geometry=this.fallenMeshes.get(role)??this.cacheFallenMesh(role,buildFallenMesh(role));
      const tint=side==='red'?0xf0b3a5:0x9aeaff;
      const spectral=new T.MeshBasicMaterial({color:tint,transparent:true,opacity:.49,depthWrite:false});
      const spirit=new T.Mesh(geometry,spectral);
      const lane=side==='red'?1:-1;
      spirit.position.set(lane*3.75,.19,(slots[side]++-3)*.69);
      spirit.scale.setScalar(.34);
      spirit.rotation.y=-lane*Math.PI/2;
      spirit.userData={role,side};
      this.fallen.add(spirit);
    }
    this.dirty=true;
  }
  resetActors() {
    this.setFallen([]);
    this.batches.clear();this.cancelMove();
    for(const[id,actor]of this.actors)this.removeActor(id,actor);
    this.fx.reset();this.audioQueue=[];this.clearCameraImpulse();
    this.actors.clear();
  }
  revealActor(id:string,role:VisibleRole){
    const old=this.actors.get(id);if(!old||old.role===role)return;
    const next=makeActor({id,role,side:old.side,x:old.group.userData.x,y:old.group.userData.y},this.quality);next.group.position.copy(old.group.position);next.target.copy(old.target);
    next.facing=shortAngle(old.model.rotation.y+old.facing-next.model.rotation.y);this.removeActor(id,old);this.actors.set(id,next);this.root.add(next.group);for(const v of this.transition?.victims??[])if(v.actor===old)v.actor=next;
  }
  private keepPublicModel(actor:Actor){
    if(actor.publicIdentity)return;
    actor.publicIdentity=true;
    actor.model.traverse(object=>{if(object instanceof T.Mesh)object.frustumCulled=false;});
  }
  unsealActor(id:string,role:'king'|'guard',now=performance.now()){
    this.revealActor(id,role);
    const actor=this.actors.get(id);
    if(!actor)return;
    this.keepPublicModel(actor);
    if(this.state.reduced||actor.unseal)return;
    const color=role==='king'?0xffc361:0xc0edff;
    const surfaces:Unseal['surfaces']=new Map();
    actor.model.traverse(o=>{
      if(!(o instanceof T.Mesh)||!(o.material instanceof T.MeshStandardMaterial))return;
      const m=o.material;
      if(m.userData.scope==='base'||(role==='guard'&&m.metalness<.4)||surfaces.has(m))return;
      surfaces.set(m,{color:m.emissive.clone(),intensity:m.emissiveIntensity});
    });
    actor.unseal={start:now,color,surfaces};
    this.fx.unseal(actor.group.position,actor.facing+actor.model.rotation.y,role,now);
    this.dirty=true;
  }
  private syncEffects(state:SceneState,rites:Rites|undefined,now:number){
    const tr=this.transition;const pieces=state.pieces.map(p=>tr?.publicBeats.reveals.some(r=>r.id===p.id&&!tr.impacts.has(r.step))?tr.beforePieces.find(b=>b.id===p.id)??p:p);
    for(const v of tr?.victims??[])if(!tr!.impacts.has(v.index)){const p=tr!.beforePieces.find(p=>p.id===v.id);if(p&&!pieces.some(b=>b.id===p.id))pieces.push(p);}
    const cues=this.fx.update(state.mode,rites,pieces,state.preview,state.pendingCharge,state.pieces.find(p=>p.id===state.selected),now,state.reduced);
    for(const kind of cues??[]){
      this.audioQueue.push({kind,options:{group:'ceremony',key:`${this.instance}/rite/${++this.ceremonySerial}`,reduced:state.reduced},at:now});
      if(kind==='rite-open'&&!this.transition?.silent&&!document.hidden)this.ink.add('rite',now,cellToWorld(3,3,.25),{reduced:state.reduced});
    }
  }
  animateMove(id:string,role:VisibleRole,to:{x:number;y:number},victimId?:string,reduced=false):Promise<boolean>{return this.animatePath(id,role,[{...to,...(victimId?{victimId}:{})}],reduced,false);}
  animatePath(id:string,role:VisibleRole,steps:ActionStep[],reduced=false,execution=false,options:{charge?:boolean;publicBeats?:PublicBeats}={}):Promise<boolean>{
    this.cancelMove();const actor=this.actors.get(id);if(!actor||!steps.length)return Promise.resolve(false);
    // A caller can never promote an opaque actor by supplying its true role.
    role=actor.role==='unknown'||role==='unknown'?'unknown':actor.role;this.lastSkipped=false;
    const victims=steps.flatMap((step,index)=>{const a=step.victimId?this.actors.get(step.victimId):undefined;return a?[{id:step.victimId!,actor:a,index,at:a.group.position.clone(),disclosed:false}]:[];});
    const victimId=victims[0]?.id,to=steps.at(-1)!,line=battleTimeline(role,steps.length,execution,!!victimId,!!options.charge,reduced),from=actor.group.position.clone(),destination=cellToWorld(to.x,to.y,.18),dir=destination.clone().sub(from).setY(0);
    const points=[from,...steps.map(step=>cellToWorld(step.x,step.y,.18))];
    const segments=steps.map((_,i)=>({from:points[i],to:points[i+1],direction:points[i+1].clone().sub(points[i]).setY(0).normalize()}));
    const goalFacing=dir.lengthSq()>.001?shortAngle(Math.atan2(dir.x,dir.z)-actor.model.rotation.y):actor.facing;
    if(!execution&&!victimId&&dir.lengthSq()>.001){line.cues.push({kind:'slide',at:.19});line.cues.sort((a,b)=>a.at-b.at);}
    this.boardMarks.landAt(to.x,to.y,!!to.victimId);
    if(execution)this.fx.startAction(from,steps,role);else if(victimId)this.fx.startStrike(role,from,steps);else if(role==='martyr'&&!reduced)this.fx.startMartyrTrail(from,steps);
    this.lastAttack=victimId||execution?{role,victimId,dissolved:false,execution,path:steps.map(p=>({...p}))}:null;
    return new Promise(finish=>{this.transition={id,role,actor,victim:victims[0]?.actor,victimId,victims,steps:steps.map(p=>({...p})),segments,execution,cues:line.cues,emitted:new Set(),silent:false,impacts:new Set(),restore:actor.rest,from,to:destination,start:performance.now(),duration:line.duration,impact:false,finish,line,publicBeats:options.publicBeats??{captures:[],reveals:[]},beforeRites:this.state.ritual?structuredClone(this.state.ritual):undefined,beforePieces:structuredClone(this.state.pieces),ceremonyCommitted:false,lastProgress:0,startLift:actor.model.position.y,fromFacing:actor.facing,goalFacing,groupKey:`battle/${this.instance}/${++this.actionSerial}`};});
  }
  cancelMove(completed=false){
    const tr=this.transition;this.transition=null;
    if(!completed)this.ink.clear();
    if(!tr)return;
    this.executionShade.style.opacity='0';this.executionLamp.intensity=0;
    this.boardMarks.clearLanding();tr.restore();if(this.actors.get(tr.id)===tr.actor){tr.actor.group.position.copy(tr.to);tr.actor.facing=tr.goalFacing;if(tr.actor.rig){const pose=neutralPose();if(tr.actor.role==='guard'&&this.state.pieces.find(p=>p.id===tr.id)?.charging){drawStance(pose);}poseFigure(tr.actor.rig,pose,tr.actor.facing);}}
    for(const v of tr.victims){
      if(v.fracture)this.disposeGroup(v.fracture);
      this.removeActor(v.id,v.actor);
    }
    this.renderer.shadowMap.needsUpdate=true;
    if(!completed||tr.silent){this.audioQueue=this.audioQueue.filter(c=>c.options.group!==tr.groupKey);this.onBattleCancel?.(tr.groupKey);}
    if(completed)this.fx.clearAction();else this.fx.clearTransient();
    this.clearCameraImpulse();
    // Give the final rendered pose a frame before React mounts the capture card.
    if(completed&&tr.execution&&!tr.silent&&this.debugActionProgress===null&&!document.hidden){
      requestAnimationFrame(()=>tr.finish(true));
    }else tr.finish(completed);
  }
  private clearCameraImpulse(){this.cameraImpulse=null;if(this.cameraBase.lengthSq()){this.camera.position.copy(this.cameraBase);this.camera.lookAt(0,-.05,0);this.camera.updateMatrixWorld();}}
  private stepMove(now:number){
    const tr=this.transition;if(!tr)return;this.dirty=true;
    if(this.renderer.shadowMap.enabled&&now-this.lastMotionShadow>=72){
      this.renderer.shadowMap.needsUpdate=true;this.lastMotionShadow=now;
    }
    if(this.actors.get(tr.id)!==tr.actor){this.cancelMove();return;}
    const progress=Math.max(tr.lastProgress,clamp((now-tr.start)/tr.duration));tr.lastProgress=progress;
    // Split one visible statue per frame in the wind-up, ahead of either hit.
    if(tr.execution&&!tr.line.reduced&&!tr.silent&&progress<drawStart){
      const waiting=tr.victims.find(v=>!v.fracture&&!v.actor.disposed);
      if(waiting)waiting.fracture=this.fx.prepareFracture(waiting.actor.model);
    }
    const sample=sampleBattle(progress,tr.line,tr.steps.length),index=tr.execution?sample.index:0,actor=tr.actor;
    const {from,to,direction:dir}=tr.segments[index];
    actor.group.position.lerpVectors(from,to,sample.travel);actor.model.position.y=sample.lift+tr.startLift*(1-smooth(progress/.28));
    if(tr.execution&&!tr.line.reduced&&!tr.silent){
      const focus=smooth(progress/.14)*(1-smooth((progress-.79)/.20));
      this.executionShade.style.opacity=String(.84*focus);
      this.executionLamp.intensity=7*focus;
      this.executionLamp.position.copy(actor.group.position).add(new T.Vector3(.23,2.1,.28));
    }
    this.boardMarks.setLandingContact(progress,tr.line.plant,tr.line.reduced);
    if(actor.rig){const turn=tr.line.reduced?1:smooth(clamp(progress/.26));poseFigure(actor.rig,sample.pose,tr.fromFacing+shortAngle(tr.goalFacing-tr.fromFacing)*turn);}
    const weapon=actor.rig?.weapon;
    weapon?.updateWorldMatrix(true,false);
    const tip=weapon?new T.Vector3().fromArray(weapon.userData.contact).applyMatrix4(weapon.matrixWorld):actor.group.position;
    const edge=weapon&&(tr.role==='guard'||tr.role==='king')
      ? new T.Vector3().fromArray(weapon.userData.trailEdge).applyMatrix4(weapon.matrixWorld) : undefined;
    this.fx.stepAction(progress,actor.group.position,Math.sign(dir.z),tip,index,sample.local,tr.line.reduced,edge,now);
    for(const{cue,index:cueIndex}of consumeCues(tr.cues,tr.emitted,progress)){
      const at=tr.start+cue.at*tr.duration,age=now-at,fresh=age<160&&!document.hidden&&!tr.silent;
      if(import.meta.env.MODE==='test')this.cueLog.push({id:tr.id,kind:cue.kind,index:cue.index});
      let material:VisibleRole='unknown';
      if(fresh&&cue.kind==='slide'){
        this.ink.add('slide',at,actor.group.position,{direction:dir,reduced:tr.line.reduced,
          follow:()=>actor.group.position.clone().add(new T.Vector3(0,.27,0)).addScaledVector(dir,-.28)});
      }
      if(fresh&&cue.kind==='dash'&&tr.role!=='unknown'){
        const bladeHeight=new T.Vector3(0,.85,0);
        this.ink.add('dash',at,tr.from.clone().add(bladeHeight),{end:tr.to.clone().add(bladeHeight),reduced:tr.line.reduced,color:'#f4fbff'});
      }
      if(fresh&&cue.kind==='charged'&&tr.role==='guard'){
        this.ink.add('charge',at,tip,{reduced:tr.line.reduced,follow:()=>actor.rig!.weapon.localToWorld(new T.Vector3(0,.32,0))});
      }
      if(cue.kind==='disclose'){
        const beat=tr.publicBeats.captures.find(c=>c.step===cue.index);
        const victim=tr.victims.find(v=>v.index===cue.index);
        if(beat&&victim&&!victim.disclosed){
          victim.disclosed=true;
          if(!tr.execution&&!victim.actor.disposed&&!tr.silent&&progress<.98)this.revealActor(victim.id,beat.capture.role);
          if(fresh&&tr.execution&&!tr.line.reduced&&!victim.actor.disposed){
            // A sparse frame sequence can skip the wind-up preparation.
            this.fx.fracture(victim.fracture??this.fx.prepareFracture(victim.actor.model),dir,at);
            victim.fracture=undefined;
            victim.actor.model.visible=false;
          }
          if(fresh&&!tr.execution&&!tr.line.reduced)this.fx.ash(victim.at,dir,at);
          if(fresh)this.ink.add('soul',at,victim.at.clone().add(new T.Vector3(0,.72,0)),{reduced:tr.line.reduced});
          if(!tr.silent)this.onPublicCapture?.(beat.capture);
        }
        continue;
      }
      if(cue.kind==='impact'){
        const i=cue.index!,hit=tr.steps[i];tr.impacts.add(i);tr.impact=true;
        const victim=tr.victims.find(v=>v.index===i);
        if(!victim)continue;
        const reveals=tr.publicBeats.reveals.filter(r=>r.step===i);
        for(const reveal of reveals){
          if(fresh)this.unsealActor(reveal.id,reveal.role,at);
          else this.revealActor(reveal.id,reveal.role);
        }
        if(reveals.length)tr.ceremonyCommitted=true;
        const rites=tr.ceremonyCommitted?tr.pendingState?.ritual:tr.beforeRites;
        if(tr.pendingState)this.syncEffects(tr.pendingState,rites,now);
        if(!tr.silent)this.onBoardContact?.(tr.id,hit,rites,reveals);
        material=victim.actor.role;
        if(fresh){
          const contact=victim.at.clone().add(new T.Vector3(0,.55,0));
          this.ink.add(tr.execution?'shatter':'impact',at,contact,{reduced:tr.line.reduced});
          this.fx.impact(hit.x,hit.y,tr.role,dir,tr.line.reduced,at,tr.execution);
        if(tr.role==='king'&&!tr.line.reduced)this.fx.crownStrike(actor.group.position,at);if(!tr.line.reduced&&this.state.cinematic&&(tr.execution||tr.publicBeats.decisive===i))this.cameraImpulse={at,direction:dir.clone()};}
      }
      if(cue.kind==='recover'&&tr.pendingState&&!tr.ceremonyCommitted){tr.ceremonyCommitted=true;this.syncEffects(tr.pendingState,tr.pendingState.ritual,now);}
      if(fresh){const kind=tr.execution&&tr.role!=='unknown'?`execution-${cue.kind}`:`battle-${tr.role}-${cue.kind}`;this.audioQueue.push({kind,options:{key:`${tr.groupKey}/${cueIndex}`,group:tr.groupKey,reduced:tr.line.reduced,material,decisive:cue.kind==='impact'&&tr.publicBeats.decisive===cue.index},at});}
    }
    for(const v of tr.victims){if(v.actor.disposed)continue;const hit=tr.line.contacts[v.index]??.58;if(progress<hit)continue;
      const discloseAt=hit+disclosureDelay(tr.duration);
      const end=Math.min(.98,hit+(tr.execution?.24:.39));
      const age=smooth(clamp((progress-discloseAt)/(end-discloseAt)));
      if(age>=.999){this.removeActor(v.id,v.actor);continue;}
      const sinceHit=(progress-hit)*tr.duration;
      const kick=tr.line.reduced||v.actor.role==='unknown'?0:smooth(sinceHit/45)*(1-smooth((sinceHit-45)/180));
      v.actor.group.position.copy(v.at).addScaledVector(dir,.12*kick);
      const fall=tr.execution||tr.line.reduced||v.actor.role==='unknown'?0:1.22*smooth((age-.03)/.69);
      v.actor.group.rotation.set(dir.z*(.13*kick+fall),0,-dir.x*(.13*kick+fall));
      if(v.actor.rig&&!tr.execution&&v.actor.role!=='unknown')poseFigure(v.actor.rig,retirementPose(v.actor.role,age,tr.line.reduced),v.actor.facing);
      if(progress<discloseAt||!v.actor.model.visible)continue;
      (v.actor.rune.material as T.MeshBasicMaterial).opacity=.25*(1-age);
      for(const m of v.actor.materials){
        if(!m.transparent||m.depthWrite){m.transparent=true;m.depthWrite=false;m.needsUpdate=true;}
        const start=tr.execution?0:m.userData.scope==='base'?.58:m.userData.scope==='crown'?.35:.18;
        m.opacity=1-smooth(clamp((age-start)/(.98-start)));
      }
    }
    const effectStillPlaying=tr.victims.length>0&&!tr.silent&&this.fx.transients.some(effect=>
      (effect.kind==='fracture'||effect.kind==='unseal')&&effect.start>=tr.start&&now<effect.start+effect.life
    );
    if(progress>=1&&!effectStillPlaying){if(tr.pendingState&&!tr.ceremonyCommitted)this.syncEffects(tr.pendingState,tr.pendingState.ritual,now);if(this.lastAttack)this.lastAttack.dissolved=true;this.cancelMove(true);}
  }
  effect(x:number,y:number,role:VisibleRole){this.fx.impact(x,y,role,new T.Vector3(0,0,-1),this.state.reduced);this.dirty=true;}
  rotate() { this.desiredAngle += Math.PI / 2; }
  setZoom(value:number) { this.desiredZoom=T.MathUtils.clamp(value,.75,1.5); }
  adjustZoom(delta:number) { this.setZoom(this.desiredZoom+delta); }
  private touchSpan(){
    const [first,second]=this.touches.values();
    return first&&second?first.distanceTo(second):0;
  }
  resetCamera() { this.desiredAngle = this.state.viewer === 'blue' ? Math.PI + .55 : .55; this.desiredZoom = 1; }
  syncLayout() { this.resize(); }
  layoutReady() {
    const c=this.renderer.domElement,r=c.getBoundingClientRect(),h=this.host.getBoundingClientRect();
    return Math.abs(r.width-h.width)<1&&Math.abs(r.height-h.height)<1&&Math.abs(this.camera.aspect-h.width/h.height)<.00001;
  }
  private resize() {
    const rect=this.host.getBoundingClientRect(),w=rect.width,h=rect.height;
    this.displayDensity=devicePixelRatio;
    this.layoutSuspended=w<=0||h<=0;
    if(this.layoutSuspended)return;
    const {ratio}=renderResolution(w,h,devicePixelRatio,this.quality);
    if(Math.abs(w-this.measuredWidth)<.01&&Math.abs(h-this.measuredHeight)<.01&&Math.abs(ratio-this.measuredDensity)<.0001)return;
    this.measuredWidth=w;this.measuredHeight=h;this.measuredDensity=ratio;this.displayDensity=devicePixelRatio;this.dirty=true;this.renderer.domElement.dataset.ready='false';
    this.renderer.setDrawingBufferSize(w,h,ratio);this.bufferResizes++;
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  }
  private pointerDown = (e: PointerEvent) => {
    if(e.pointerType==='touch'){
      this.touches.set(e.pointerId,new T.Vector2(e.clientX,e.clientY));
      this.renderer.domElement.setPointerCapture(e.pointerId);
      const span=this.touchSpan();
      if(this.touches.size>1){
        this.down=null;
        if(!this.pinch&&span>0)this.pinch={span,zoom:this.desiredZoom};
        return;
      }
    }
    if (!e.isPrimary || (e.button !== 0 && e.button !== 2)) return;
    this.down = { x: e.clientX, y: e.clientY, id: e.pointerId, button: e.button };
    this.dragging = e.button === 2;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };
  private pointerMove = (e: PointerEvent) => {
    const point=this.touches.get(e.pointerId);
    if(point){
      point.set(e.clientX,e.clientY);
      const span=this.touchSpan();
      if(this.pinch&&span>0){this.setZoom(this.pinch.zoom*span/this.pinch.span);return;}
    }
    if (this.down?.id !== e.pointerId) return;
    if (this.dragging) { this.desiredAngle += (e.clientX - this.down.x) * .008; this.down.x = e.clientX; }
  };
  private pointerCancel = (e:PointerEvent) => {
    this.touches.delete(e.pointerId);
    if(this.touches.size<2)this.pinch=undefined;
    if(this.down?.id===e.pointerId){this.down=null;this.dragging=false;}
  };
  private pointerUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if(this.touches.size<2)this.pinch=undefined;
    const down=this.down;
    if(!down||down.id!==e.pointerId)return;
    this.down=null;
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
  hudProjection(){
    this.camera.updateMatrixWorld(true);
    const rect=this.renderer.domElement.getBoundingClientRect(),point=new T.Vector3();
    const screen=()=>{point.project(this.camera);return{x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2};};
    return {
      actor:(id:string,height:number)=>{
        const actor=this.actors.get(id);
        if(!actor)return null;
        point.copy(actor.group.position);point.y+=height;
        return screen();
      },
      cell:(x:number,y:number,height=.14)=>{point.set(x-3,height,y-3);return screen();},
    };
  }
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
    this.applyQuality();
    if(devicePixelRatio!==this.displayDensity)this.resize();
    if(this.layoutSuspended)return;
    const now = performance.now();
    const cameraMoving=this.angle!==this.desiredAngle||this.zoom!==this.desiredZoom;
    const animating=!!this.transition||!!this.burst||this.fx.transients.length>0||this.ink.active;
    // Settle static previews at the existing idle cadence. All active cues
    // still run on every frame using their absolute timestamps.
    if(!this.dirty&&!cameraMoving&&!animating&&(this.state.reduced||now-this.lastRender<1000/QUALITY[this.quality].idleFps))return;
    const elapsed=(now-this.last)/1000,dt=Math.min(elapsed,.05);
    this.last=now;
    // Full privacy/result covers have no interactive 3D content. Stop their
    // hidden GPU work so DOM/SVG ending animation can use the compositor freely.
    if(this.state.viewer===null&&this.state.active){this.audioQueue=[];this.lastCamera=now;this.dirty=false;return;}
    const speed = this.state.reduced ? 1 : 1 - Math.exp(-Math.min((now-this.lastCamera)/1000,.25) * 7); this.lastCamera=now;
    this.angle += (this.desiredAngle - this.angle) * speed; this.zoom += (this.desiredZoom - this.zoom) * speed;
    // Camera fit only changes during orbit, zoom, or a layout change.
    if(Math.abs(this.angle-this.desiredAngle)<.0008)this.angle=this.desiredAngle;
    if(Math.abs(this.zoom-this.desiredZoom)<.001)this.zoom=this.desiredZoom;
    const aspect=this.camera.aspect,fitKey=`${aspect}/${this.state.active}`;
    if(fitKey!==this.cameraFitKey){
      const fit=aspect<.85?1.28:aspect<1.1?1.12:1;
      const base=(this.state.active?14.7:10.8)*fit;
      let required=base;
      if(this.state.active){
        // Square-board symmetry lets us fit the entire orbit in a quarter turn.
        // Applying zoom after this calculation keeps the orbit radius constant.
        const corner=new T.Vector3();
        for(let n=0;n<=8;n++){
          const angle=n*Math.PI/32;
          let radius=base;
          for(let i=0;i<3;i++){
            this.camera.position.set(Math.sin(angle)*radius*.78,radius*.83,Math.cos(angle)*radius*.78);
            this.camera.lookAt(0,-.05,0);this.camera.updateMatrixWorld(true);
            let overflow=1;
            for(const x of [-3.6,3.6])for(const z of [-3.6,3.6])for(const y of [.05,1.85]){
              corner.set(x,y,z).project(this.camera);
              overflow=Math.max(overflow,Math.abs(corner.x)/.94,Math.abs(corner.y)/.82);
            }
            if(overflow<=1.002)break;
            radius*=overflow*1.01;
          }
          required=Math.max(required,radius);
        }
      }
      this.cameraFitKey=fitKey;this.cameraFitDistance=required;
    }
    const distance=this.cameraFitDistance/this.zoom;
    this.camera.position.set(Math.sin(this.angle)*distance*.78,distance*.83,Math.cos(this.angle)*distance*.78);
    this.camera.lookAt(0,-.05,0);
    this.cameraBase.copy(this.camera.position);

    for (const [id, actor] of this.actors) {
      const piece=this.state.pieces.find(p=>p.id===id);
      if(actor.unseal){
        // Animated actor materials are private and bypass the instance pool.
        const {start,color,surfaces}=actor.unseal,age=clamp((now-start)/620);
        const tint=new T.Color(color);
        const glow=Math.sin(Math.PI*Math.sqrt(age))*(actor.role==='king'?1.3:.72+.23*Math.cos(age*Math.PI*8));
        for(const [surface,base] of surfaces){
          surface.emissive.copy(base.color);
          surface.emissiveIntensity=base.intensity;
          if(age<1){surface.emissive.lerp(tint,Math.min(1,glow));surface.emissiveIntensity+=glow;}
        }
        if(age>=1)actor.unseal=undefined;
      }
      if(this.transition?.id===id||this.transition?.victims.some(v=>v.id===id))continue;
      actor.group.position.lerp(actor.target,this.state.reduced?1:1-Math.exp(-dt*10));const selectedLift=!this.state.reduced&&actor.role!=='unknown'&&this.state.selected===id ? .032 : 0;
      actor.model.position.y=T.MathUtils.damp(actor.model.position.y,selectedLift,22,dt);
      if(actor.rig){const pose=neutralPose(),charged=actor.role==='guard'&&(!!piece?.charging||this.state.pendingCharge===id);if(!this.state.reduced&&actor.role!=='unknown'){pose.heave=Math.sin(now*.0013+actor.target.x)*.003;pose.capeDrag=Math.sin(now*.0011+actor.target.x)*.009;}if(charged){drawStance(pose);}poseFigure(actor.rig,pose,actor.facing);}
      actor.rune.rotation.z += this.state.reduced ? 0 : Math.min(elapsed,.1) * .12;
    }
    const actionTime=import.meta.env.MODE==='test'&&this.debugActionProgress!==null&&this.transition?this.transition.start+this.transition.duration*this.debugActionProgress:now;
    this.stepMove(actionTime);
    const cut=this.transition;
    if(cut?.execution&&this.state.cinematic&&!cut.line.reduced&&!cut.silent){
      const t=cut.lastProgress,frame=smooth(t/.32)*(1-smooth((t-drawStart-drawSpan)/.34));
      const target=cut.from.clone().lerp(cut.to,.5);
      this.camera.position.lerp(target,.32*frame);
      this.camera.lookAt(target.x*.48*frame,-.05+.46*frame,target.z*.48*frame);
    }
    if(cut?.execution&&!cut.line.reduced&&!cut.silent){
      const point=this.projectActor(cut.id,.72);
      if(point){this.executionShade.style.setProperty('--focus-x',point.x+'px');this.executionShade.style.setProperty('--focus-y',point.y+'px');}
    }
    if(!cut?.execution&&this.cameraImpulse&&this.state.cinematic&&!this.state.reduced){const t=(actionTime-this.cameraImpulse.at)/180;if(t>=1)this.cameraImpulse=null;else{this.camera.position.addScaledVector(this.cameraImpulse.direction,-.018*Math.sin(t*Math.PI)*(1-t));this.camera.lookAt(0,-.05,0);}}
    this.ink.tick(actionTime,this.camera,this.measuredWidth,this.measuredHeight);
    this.fx.tick(actionTime,this.state.reduced,this.actors);
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
    if (!this.state.reduced) this.particles.rotation.y += Math.min(elapsed,.1) * .007;
    const ready=String(this.measuredWidth>0&&this.measuredHeight>0&&Math.abs(this.angle-this.desiredAngle)<.0008&&Math.abs(this.zoom-this.desiredZoom)<.001);
    if(this.renderer.domElement.dataset.ready!==ready)this.renderer.domElement.dataset.ready=ready;
    const moving=!!this.transition||!!this.burst||this.fx.transients.length>0||ready==='false';
    if (!document.hidden&&(this.dirty||moving||(!this.state.reduced&&now-this.lastRender>1000/QUALITY[this.quality].idleFps))){
      this.renderer.render(this.scene,this.camera);this.renderedFrames++;this.lastRender=now;this.dirty=false;
      const cues=this.audioQueue.splice(0);if(!document.hidden)for(const cue of cues)if(actionTime-cue.at<180)this.onBattleCue?.(cue.kind,cue.options);
    }
  };
  skipMove(){if(!this.transition)return;this.lastSkipped=true;this.transition.silent=true;this.stepMove(this.transition.start+this.transition.duration+1);this.fx.clearTransient();this.ink.clear();this.audioQueue=[];this.clearCameraImpulse();}
  private removeActor(id:string,actor:Actor){
    // A stale animation may only release the exact instance it owns. Never an
    // actor with the same ID from a new perspective or a restarted match.
    if(this.actors.get(id)!==actor||actor.disposed)return;actor.disposed=true;actor.group.removeFromParent();this.actors.delete(id);this.disposeGroup(actor.group);
  }
  private disposeGroup(g: T.Object3D) {
    const geometries=new Set<T.BufferGeometry>(), materials=new Set<T.Material>(), textures=new Set<T.Texture>();
    g.traverse(o=>{
      if(!(o instanceof T.Mesh||o instanceof T.Line))return;
      if(o instanceof T.InstancedMesh)o.dispose();
      if(!o.geometry.userData.shared)geometries.add(o.geometry);
      for(const m of Array.isArray(o.material)?o.material:[o.material]){
        if(!m.userData.shared&&m!==metal&&m!==darkMetal&&m!==obsidian)materials.add(m);
      }
    });
    for(const m of materials)for(const value of Object.values(m)){
      if(value instanceof T.Texture&&!value.userData.shared)textures.add(value);
    }
    geometries.forEach(geometry=>geometry.dispose());
    materials.forEach(material=>material.dispose());
    textures.forEach(texture=>texture.dispose());
  }
  destroy() {
    this.cancelMove(); this.dead = true; cancelAnimationFrame(this.frame); this.observer.disconnect(); this.ink.destroy();
    this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown); this.renderer.domElement.removeEventListener('pointerup', this.pointerUp); this.renderer.domElement.removeEventListener('pointermove', this.pointerMove); this.renderer.domElement.removeEventListener('contextmenu', this.contextMenu);
    this.renderer.domElement.removeEventListener('pointercancel', this.pointerCancel);
    this.renderer.domElement.removeEventListener('lostpointercapture', this.pointerCancel);
    this.fallenWorker?.terminate();
    this.fallenMeshes.forEach(geometry=>geometry.dispose());this.fallenMeshes.clear();
    this.batches.clear();this.fx.destroy();this.disposeGroup(this.scene); disposeCharacters(); this.environment.dispose();disposeSurfaces(); this.renderer.dispose(); this.renderer.domElement.remove();this.executionShade.remove();
  }
}
