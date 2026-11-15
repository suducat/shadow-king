import fs from 'node:fs';import assert from 'node:assert/strict';
import {decide,observe,type Difficulty} from '../src/ai';import {act} from '../src/game';import {inferIdentities} from '../src/belief';import {attacks} from '../src/strategy-eval';
import {strategicFixture,baitHistory,type Tactic} from '../tests/ai-v05-fixtures';
const expected:Record<Tactic,string>={A:'increase control over the nine altar cells before the last martyr falls',B:'cover or block the revealed king entrance at (3,2)',C:'do not charge a remote corner without a tactical purpose',D:'do not automatically spend execution after the target leaves',E:'king captures the safe revealed guard at (3,2)',F:'decline probable final-martyr bait when the other unknown can convert the rite',G:'retain uncertainty under aggressive king/martyr disguise',H:'capture the final revealed guard for purge',I:'capture the revealed king for immediate victory'};
const rows=[];
for(const level of ['hard','master'] as Difficulty[])for(const name of Object.keys(expected) as Tactic[]){
 const g=strategicFixture(name),o=observe(g,'red',name==='F'||name==='G'?baitHistory():[]),belief=inferIdentities(o),d=decide(o,level,{seed:421,maxMillis:Infinity}),a=d.action!,next=act(g,a),map=attacks(next,'red');
 const control=(m:Map<string,number>)=>[...m.keys()].filter(k=>{const[x,y]=k.split('/').map(Number);return x>=2&&x<=4&&y>=2&&y<=4;}).length;
 const passed=name==='A'?control(map)>control(attacks(g,'red')):name==='B'?map.has('3/2')||next.pieces.some(p=>p.side==='red'&&p.x===3&&p.y===2):name==='C'?a.kind!=='charge':name==='D'?a.kind!=='execute':name==='E'?a.id==='red-3'&&a.x===3&&a.y===2:name==='F'?!(a.x===0&&a.y===2):name==='G'?belief.marginals['blue-1'].king>.05&&belief.marginals['blue-1'].martyr<.95:next.result?.winner==='red'&&next.result.reason===(name==='H'?'guard':'king');
 assert.ok(passed,`${level}/${name}`);rows.push({level,case:name,expected:expected[name],passed,actual:a,result:next.result,altarCellsControlled:control(map),baitBelief:belief.marginals['blue-1'],nodes:d.nodes,diagnostics:d.diagnostics});
}
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/v05-tactics.json',JSON.stringify({complete:true,rows},null,2));console.log(`${rows.length} production-node-cap tactical cases passed`);
