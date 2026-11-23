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
 type:'state';revision:number;serverNow:number;rule:GameMode;stage:'waiting'|'ready'|'deploying'|'playing';
 matchId:string;game:ProjectedGame|null;lastTurn:CourtIntent|null;
 ready:boolean;otherReady:boolean;opponentConnected:boolean;
 deploymentUntil?:number;deploymentLocked:boolean;rematchRequested:boolean;opponentRematch:boolean;
};
export type CourtNotice=
 |{type:'ack';actionId:string;sequenceNumber:number}
 |{type:'error';message:string;actionId?:string}
 |{type:'closed';message:string};
