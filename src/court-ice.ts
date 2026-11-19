// Open Relay publishes this shared static-auth secret for public TURN use.
// https://www.metered.ca/tools/openrelay/#-credentials
const relayHost='staticauth.openrelay.metered.ca';
const publicRelaySecret='openrelayprojectsecret';

export async function courtIce():Promise<RTCConfiguration>{
 const encoder=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',encoder.encode(publicRelaySecret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const expires=Math.floor(Date.now()/1000)+3600;
 const username=`${expires}:shadow-king-${crypto.randomUUID()}`;
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(username)));
 return {iceServers:[
  {urls:['stun:stun.cloudflare.com:3478','stun:stun.l.google.com:19302']},
  {urls:[`turn:${relayHost}:80?transport=tcp`,`turn:${relayHost}:443?transport=tcp`,`turns:${relayHost}:443?transport=tcp`],
   username,credential:btoa(String.fromCharCode(...bytes))},
 ]};
}
