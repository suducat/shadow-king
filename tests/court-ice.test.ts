import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {courtIce,relayConfiguration} from '../src/court-ice';

test('court ICE offers TCP and TLS relay with a short-lived Open Relay credential',async()=>{
 const cfg=await courtIce(),relay=cfg.iceServers?.find(server=>server.username);
 assert.ok(relay?.username);
 assert.ok(Array.isArray(relay.urls)&&relay.urls.some(url=>url.startsWith('turns:')&&url.endsWith(':443?transport=tcp')));
 assert.ok(relay.urls.some(url=>url.endsWith(':80?transport=udp')));
 assert.ok(relay.urls.some(url=>url.endsWith(':443?transport=tcp')));
 assert.equal(cfg.iceTransportPolicy,undefined);
 assert.deepEqual(relayConfiguration(cfg),{...cfg,iceTransportPolicy:'relay'});
 const expires=Number(relay.username.split(':')[0])-Date.now()/1000;
 assert.ok(expires>3500&&expires<=3600);
 assert.equal(relay.credential,createHmac('sha1','openrelayprojectsecret').update(relay.username).digest('base64'));
});
