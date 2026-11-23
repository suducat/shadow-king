import {readProfile,type CourtProfile} from './court-protocol';
const profileKey='shadow-king-court-profile';
let cached:CourtProfile|undefined;
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
