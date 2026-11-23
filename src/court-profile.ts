import {readProfile,type CourtProfile} from './court-protocol';
const profileKey='shadow-king-court-profile';
const muteKey='shadow-king-court-muted';
let cached:CourtProfile|undefined;
let muted=false;
export function courtProfile(){
 if(cached)return cached;
 try{cached=readProfile(JSON.parse(localStorage.getItem(profileKey)??'null'));}catch{/* Storage may be unavailable. */}
 if(!cached)saveProfile({id:crypto.randomUUID().replaceAll('-','').slice(0,12),nickname:'执棋者'});
 return cached!;
}
export function saveProfile(profile:CourtProfile){
 cached=profile;
 try{localStorage.setItem(profileKey,JSON.stringify(profile));}catch{/* Keep the session copy. */}
}
export function courtMuted(){
 try{return (localStorage.getItem(muteKey)??String(muted))==='true';}catch{return muted;}
}
export function setCourtMuted(value:boolean){
 muted=value;
 try{localStorage.setItem(muteKey,String(value));}catch{/* Keep the session copy. */}
}
