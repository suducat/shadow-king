import type {Game, Role, Side, VisiblePiece} from './game';
import type {GameAction, GameMode} from './ritual';

export const COURT_VERSION=1;
export const COURT_SOCKET='shadow-king-v1';
export const ROOM_TTL=30*60_000;
export const DEPLOYMENT_MS=30_000;
export const SEAT_RESERVATION_MS=45_000;

export type RoomTicket={code:string;side:Side;playerId:string;token:string};
export type ProjectedGame=Omit<Game,'pieces'|'seen'>&{pieces:VisiblePiece[]};
export type CourtIntent={
 matchId:string;actionId:string;playerId:string;turnNumber:number;sequenceNumber:number;
 actionType:'move'|'charge'|'execute'|'resign';payload:GameAction|null;
};
export type CourtCommand=
 |{type:'ready';value:boolean}
 |{type:'deployment'|'draft';matchId:string;line:Role[]}
 |{type:'rematch';matchId:string}
 |{type:'action';intent:CourtIntent};
export type CourtSnapshot={
 profiles?:Partial<Record<Side,CourtProfile>>;
 type:'state';revision:number;serverNow:number;rule:GameMode;stage:'waiting'|'ready'|'deploying'|'playing';
 matchId:string;game:ProjectedGame|null;lastTurn:CourtIntent|null;
 ready:boolean;otherReady:boolean;opponentConnected:boolean;
 deploymentUntil?:number;deploymentLocked:boolean;rematchRequested:boolean;opponentRematch:boolean;
};
export type CourtNotice=
 |{type:'ack';actionId:string;sequenceNumber:number}
 |{type:'error';message:string;actionId?:string}
 |{type:'closed';message:string};

export const COURT_COOLDOWN=4000;
export const WHISPERS=['漂亮的一步。','你确定吗？','我已看穿你的布局。','这正合我意。','你所见的，未必是真相。','王，就在你眼前。','竟然如此……','胜负尚未注定。'] as const;
export const EMOTES=['王笑','王哭','王疑问'] as const;
export type CourtProfile={id:string;nickname:string};
export type CourtInteraction={type:'interaction';side:Side;kind:'whisper'|'emote';id:number;matchId:string};
export function readInteraction(value:unknown):Pick<CourtInteraction,'kind'|'id'>|undefined{
 if(!value||typeof value!=='object'||!('kind' in value)||!('id' in value))return;
 const {kind,id}=value;
 if((kind==='whisper'||kind==='emote')&&typeof id==='number'&&Number.isInteger(id)&&id>=0&&id<(kind==='whisper'?WHISPERS:EMOTES).length)return {kind,id};
}
export function readProfile(value:unknown):CourtProfile|undefined{
 if(!value||typeof value!=='object'||!('id' in value)||!('nickname' in value))return;
 const {id,nickname}=value;
 if(typeof id==='string'&&/^[a-f0-9]{12}$/.test(id)&&typeof nickname==='string'&&nickname.length<=24&&!/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(nickname))
  return {id,nickname:nickname.trim()||'执棋者'};
}
