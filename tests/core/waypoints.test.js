import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../src/core/data-node.js';
import {createWorld,WAYPOINT_SOLID} from '../../src/core/world.js';
import {acceptedSceneLayout} from '../../src/core/accepted-scenes.js';
import {distToPolyline} from '../../src/core/math.js';

const data=loadData();
// waypoints a scene draws itself (its pillar is authored there): the arrival beach and Moonstone Camp
const sceneDrawn=new Set(['landing',...acceptedSceneLayout.scenes.map(s=>s.waypoint?.id).filter(Boolean)]);

test('every warp pillar stands on level ground beside its road, its stone ring clear of roads and props',()=>{
 for(const [id,map] of Object.entries(data.maps)){
  const w=createWorld(map);
  for(const wp of w.waypoints){
   const name=id+'/'+wp.id;
   assert.ok(w.circles.some(c=>c.type==='waypoint'&&c.id===wp.id&&c.r===WAYPOINT_SOLID),name+' solid ring');
   assert.ok(w.isFree(wp.x,wp.z+2.2,.5),name+' arrival spot in front of the pillar');
   if(sceneDrawn.has(wp.id))continue;
   const road=Math.min(...w.roads.map(r=>distToPolyline(wp.x,wp.z,r.points)-r.width/2));
   assert.ok(road>=2.8,name+' ring clear of the road edge: '+road.toFixed(2));
   const hs=[];for(let a=0;a<12;a++)for(const r of[0,1,2,2.6])hs.push(w.groundY(wp.x+Math.sin(a/12*Math.PI*2)*r,wp.z+Math.cos(a/12*Math.PI*2)*r));
   assert.ok(Math.max(...hs)-Math.min(...hs)<.3,name+' level ground under the heap and ring');
   for(const c of w.circles)if(!(c.type==='waypoint'&&c.id===wp.id))assert.ok(Math.hypot(c.x-wp.x,c.z-wp.z)>(c.r||0)+2.6,name+' clear of '+c.type);
  }
 }
});
