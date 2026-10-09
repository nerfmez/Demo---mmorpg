// Coastal landmarks use the same cel materials and world deck/collider data.
import * as THREE from 'three';
import { outlineStructure } from './architecture.js';
import { toon, outlined } from './toon.js';
import { builder, marketFishingBoat } from './market.js';
import { coastalLighthouse, districtScenery } from './districts.js';
import { walkSurfaceMaterial } from './walk-surface.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import art from '../../data/art.json' with {type:'json'};
import { createRng } from '../core/rng.js';

const plank=art.architecture.pier;
// A timber deck of separate boards (one merged mesh): ragged board ends, tiny gaps, a little
// twist and lift per board, laid on two stringers, instead of one ruler-straight box. The
// boards sit on the painted plank pitch, so the shader's seams fall in the real gaps.
function timberDeck(d,rng) {
  const parts=[],m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),t=plank.plankThickness;
  const [lo,hi]=plank.plankEndJitter;
  for(let k=Math.floor(-d.hz/plank.plankDepth);k*plank.plankDepth<d.hz;k++){
    const z0=Math.max(-d.hz,k*plank.plankDepth),z1=Math.min(d.hz,(k+1)*plank.plankDepth);
    const depth=z1-z0-plank.plankGap;if(depth<.08)continue;
    if(d.shoreCut && z0>Math.max(...d.shoreCut))continue;
    const left=-d.hx-rng.range(lo,hi),right=d.hx+rng.range(lo,hi);
    const g=new THREE.BoxGeometry(right-left,t,depth);
    e.set(rng.range(-1,1)*plank.plankTilt,rng.range(-1,1)*plank.plankYaw,0);
    m.compose(new THREE.Vector3((left+right)/2,-t/2+rng.range(-1,1)*plank.plankLift,(z0+z1)/2),q.setFromEuler(e),new THREE.Vector3(1,1,1));
    parts.push(g.applyMatrix4(m));
  }
  for(const x of [-d.hx+.38,d.hx-.38])parts.push(new THREE.BoxGeometry(.2,.2,d.hz*2-.1).translate(x,-t-.1,0));
  const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
  if(d.shoreCut){
    // Clip the SAME plank assembly to the actual source quay edge. No wood or
    // orphan post extends behind the stone. Collision support meets that quay.
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const t=(p.getX(i)+d.hx)/(2*d.hx),end=d.shoreCut[0]+(d.shoreCut[1]-d.shoreCut[0])*t;
      p.setZ(i,Math.min(p.getZ(i),end));
    }
  }
  return geometry;
}

export function createHarbor(world){
  const steps=createHarborSteps(world);
  for(;;){const step=steps.next();if(step.done)return step.value;}
}

export function* createHarborSteps(world,{adopt}={}) {
  const root = new THREE.Group();adopt?.(root);
  const part = (geo, color, x, y, z, parent = root, material = null) => {
    const mesh = outlined(geo, material || toon(color), { outline: '#51483b', width: .025 });
    mesh.position.set(x,y,z); parent.add(mesh); return mesh;
  };
  // The city uses a single native timber assembly per collision footprint. Imported
  // slabs and the old crossjoins are omitted, so boards/piles cannot double up.
  for (const d of world.docks) {
    const pier = new THREE.Group();
    pier.userData.waterContact=true;
    pier.position.set(d.x,d.rampFromTerrain ? (d.height+d.startY)/2 : d.height+(d.kind==='breakwater'?.025:0),d.z); pier.rotation.y=d.angle;
    // Shear in local Z: keep the exact XZ footprint and both endpoint heights.
    // Rotating a whole box would shorten its projected deck and open a join gap.
    const slope=d.rampFromTerrain ? (d.height-d.startY)/(2*d.hz) : 0;
    const surfaceKind=['breakwater','slipway'].includes(d.kind)?'paving':'wood';
    const rng=createRng(7919+Math.round(d.x*31+d.z*17));
    const deckGeometry=surfaceKind==='wood'?timberDeck(d,rng):new THREE.BoxGeometry(d.hx*2,.3,d.hz*2).translate(0,-.15,0);
    const positions=deckGeometry.attributes.position;
    for(let i=0;i<positions.count;i++)positions.setY(i,positions.getY(i)+slope*positions.getZ(i));
    deckGeometry.computeVertexNormals();
    part(deckGeometry,'#ffffff',0,0,0,pier,walkSurfaceMaterial(surfaceKind,1,[d.x,d.z]));
    const details=builder();
    if(d.kind==='slipway'){
      // Low launch rails follow the same local slope and leave the centre open.
      for(const x of [-d.hx+.42,d.hx-.42]){
        const rail=new THREE.BoxGeometry(.12,.075,d.hz*2-.4),a=rail.attributes.position;
        for(let i=0;i<a.count;i++)a.setY(i,a.getY(i)+slope*a.getZ(i));rail.computeVertexNormals();
        details.part(rail,'#737f7a',x,.042,0);
      }
      for(let z=-d.hz+.55;z<d.hz-.3;z+=1.35)details.box(d.hx*2-.5,.045,.14,'#8b816c',0,.022+slope*z,z);
    }
    if(d.kind==='breakwater'){
      // Solid masonry reaches below the sea, unlike the raised timber piers.
      const bottom=world.waterLevel-.8,top=d.height-.28;
      part(new THREE.BoxGeometry(d.hx*2,top-bottom,d.hz*2),'#88968c',0,(top+bottom)/2-pier.position.y,0,pier);
      // Low segmented coping and a slightly lifted visual surface avoid a
      // coplanar cut through the landward deck; walking height stays unchanged.
      for(const x of [-d.hx+.15,d.hx-.15])for(let z=-d.hz+.65;z<d.hz-.4;z+=1.18)details.box(.24,.22,1.03,'#afb4a5',x,.11,z);
    }
    pier.add(details.finish());
    // Plank joins and grain are painted into the deck, including the sloping join.
    // Corner piles plus intermediate ones on long decks; each leans, rises and thickens a little
    // differently, like driven timber, while its waterline stays at the authored spot.
    const shore=d.shoreCut?Math.min(...d.shoreCut)-.55:d.hz-.3;
    const pileZ=[-d.hz+.3,shore],span=shore+d.hz-.3,extra=Math.floor(span/plank.pileSpacing);
    for(let i=1;i<=extra;i++)pileZ.push(-d.hz+.3+span*i/(extra+1));
    for(const x of d.kind === 'slipway' ? [] : [-d.hx+.2,d.hx-.2]) for(const [n,z] of pileZ.entries()) {
      const r=rng.range(.88,1.12),rise=rng.range(-.08,.1),corner=n<2;
      const pile=part(new THREE.CylinderGeometry(.14*r,.18*r,4+rise,6),'#6e5439',x,-1.4+rise/2+slope*z,z,pier);
      pile.rotation.set(rng.range(-1,1)*plank.pileLean,rng.range(0,Math.PI),rng.range(-1,1)*plank.pileLean);
      if(corner||rng.next()<.5)part(new THREE.TorusGeometry(.2,.045,5,10),'#d1ba82',x,.48+rise+slope*z,z,pier).rotation.set(Math.PI/2+rng.range(-.12,.12),0,rng.range(-.12,.12));
    }
    root.add(pier);yield;
  }
  const h=world.data.harbor;
  const [lx,lz]=h.lighthouse, y=world.groundY(lx,lz);
  if (!world.data.city?.enabled) {
  if(h.lighthouseStyle)root.add(coastalLighthouse(world));
  else {
  const tower=new THREE.Group(); tower.position.set(lx,y,lz);
  part(new THREE.CylinderGeometry(1.3,2,9,12),'#ede1c1',0,4.5,0,tower);
  part(new THREE.CylinderGeometry(1.42,1.58,1.1,12),'#638899',0,5.5,0,tower);
  part(new THREE.CylinderGeometry(1.65,1.65,.25,12),'#93866c',0,9,0,tower);
  part(new THREE.CylinderGeometry(1,1,1.6,8),'#e9c779',0,9.9,0,tower);
  part(new THREE.ConeGeometry(1.6,1.4,8),'#466c84',0,11.3,0,tower);
  part(new THREE.BoxGeometry(.85,1.9,.13),'#765a3e',0,.95,1.82,tower);
  root.add(tower);
  }
  }
  if(world.data.town.districtStyle)root.add(districtScenery(world));
  for(const [index,[x,z,a]] of h.boats.entries()) {
    if((world.data.city?.enabled ? world.data.city.nativeBoatIndices : world.data.town.styleSlice?.boatIndices)?.includes(index)){root.add(marketFishingBoat(x,z,a,world.waterLevel));yield;continue;}
    const boat=new THREE.Group();boat.userData.waterContact=true;boat.position.set(x,world.waterLevel+.15,z);boat.rotation.y=a;
    part(new THREE.SphereGeometry(1,12,8).scale(1.25,.65,3.8),'#654c37',0,0,0,boat);
    part(new THREE.BoxGeometry(2.15,.15,5.8),'#c1a274',0,.3,0,boat);
    part(new THREE.CylinderGeometry(.08,.12,6,6),'#8a6945',0,3.2,0,boat);
    part(new THREE.BoxGeometry(2.6,3.9,.045),'#f0e5c6',.55,3.7,0,boat);
    root.add(boat);yield;
  }
  for(const [x,z,kind] of h.signs) {
    const y=world.groundY(x,z);
    part(new THREE.BoxGeometry(.18,2.3,.18),'#80623f',0,0,0).position.set(x,y+1.15,z);
    part(new THREE.BoxGeometry(1.8,.7,.16),'#dbbd83',x,y+1.9,z);
    // Simple painted symbols stay readable without DOM labels or font assets.
    const symbol=new THREE.Group();symbol.position.set(x,y+1.9,z+.1);
    if(kind==='fields') part(new THREE.ConeGeometry(.23,.6,3),'#65844a',0,0,0,symbol);
    else {part(new THREE.BoxGeometry(.6,.3,.025),'#426c83',0,-.05,0,symbol);part(new THREE.ConeGeometry(.4,.35,3),'#426c83',0,.2,0,symbol);}
    root.add(symbol);yield;
  }
  for(const [x,z] of h.farmBeds) {
    part(new THREE.BoxGeometry(6,.12,10),'#8b7250',x,world.groundY(x,z)+.06,z,root,walkSurfaceMaterial('earth',.95,[x,z]));
    for(const offset of [-2,0,2]) part(new THREE.BoxGeometry(.35,.25,9),'#7c9551',x+offset,world.groundY(x,z)+.2,z);
  }
  for(const structure of root.children){outlineStructure(structure);yield;}
  // Two slim mooring lines per boat tie the actual hull to its adjacent deck.
  // These are static, merged together, and never create walking obstacles.
  if(world.data.city?.enabled){
    const lines=[];
    for(const berth of world.data.city.boatBerths||[]){
      const d=world.docks[berth.dock],[bx,bz,a]=h.boats[berth.boat],side=berth.side;
      for(const along of [-2.2,2.2]){
        const start=new THREE.Vector3(bx-Math.cos(a)*side*.92,world.waterLevel+.63,bz+Math.sin(a)*side*.92);
        start.x+=Math.sin(a)*along;start.z+=Math.cos(a)*along;
        const end=new THREE.Vector3(d.x+Math.cos(a)*side*(d.hx-.2),d.height+.32,d.z-Math.sin(a)*side*(d.hx-.2));
        end.x+=Math.sin(a)*(along+(berth.along||0));end.z+=Math.cos(a)*(along+(berth.along||0));
        const mid=start.clone().lerp(end,.5);mid.y-=.16;
        lines.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start,mid,end),6,.025,4,false));
      }
    }
    if(lines.length){const geo=mergeGeometries(lines);lines.forEach(g=>g.dispose());root.add(new THREE.Mesh(geo,toon('#c0a774')));}
  }
  return root;
}
