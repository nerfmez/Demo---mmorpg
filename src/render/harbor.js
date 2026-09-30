// Coastal landmarks use the same cel materials and world deck/collider data.
import * as THREE from 'three';
import { toon, outlined } from './toon.js';

export function createHarbor(world) {
  const root = new THREE.Group();
  const part = (geo, color, x, y, z, parent = root) => {
    const mesh = outlined(geo, toon(color), { outline: '#51483b', width: .025 });
    mesh.position.set(x,y,z); parent.add(mesh); return mesh;
  };
  for (const d of world.docks) {
    const pier = new THREE.Group();
    pier.position.set(d.x,d.rampFromTerrain ? (d.height+d.startY)/2 : d.height,d.z); pier.rotation.y=d.angle;
    if (d.rampFromTerrain) pier.rotation.x = -Math.atan2(d.height-d.startY,2*d.hz);
    part(new THREE.BoxGeometry(d.hx*2,.3,d.hz*2),'#a98252',0,-.15,0,pier);
    // Raised narrow seams read as planks without a mesh for every board.
    const seams=[];
    for(let z=-d.hz+.4;z<d.hz;z+=1) seams.push(z);
    const geometry=new THREE.BoxGeometry(d.hx*2,.012,.035);
    const mesh=new THREE.InstancedMesh(geometry,toon('#765b3e'),seams.length);
    const matrix=new THREE.Matrix4(); seams.forEach((z,i)=>mesh.setMatrixAt(i,matrix.makeTranslation(0,.008,z)));
    pier.add(mesh);
    for(const x of [-d.hx+.2,d.hx-.2]) for(const z of [-d.hz+.3,d.hz-.3]) {
      part(new THREE.CylinderGeometry(.14,.18,4,6),'#6e5439',x,-1.4,z,pier);
      part(new THREE.TorusGeometry(.2,.045,5,10),'#d1ba82',x,.48,z,pier).rotation.x=Math.PI/2;
    }
    root.add(pier);
  }
  const h=world.data.harbor;
  const [lx,lz]=h.lighthouse, y=world.groundY(lx,lz);
  const tower=new THREE.Group(); tower.position.set(lx,y,lz);
  part(new THREE.CylinderGeometry(1.3,2,9,12),'#ede1c1',0,4.5,0,tower);
  part(new THREE.CylinderGeometry(1.42,1.58,1.1,12),'#638899',0,5.5,0,tower);
  part(new THREE.CylinderGeometry(1.65,1.65,.25,12),'#93866c',0,9,0,tower);
  part(new THREE.CylinderGeometry(1,1,1.6,8),'#e9c779',0,9.9,0,tower);
  part(new THREE.ConeGeometry(1.6,1.4,8),'#466c84',0,11.3,0,tower);
  part(new THREE.BoxGeometry(.85,1.9,.13),'#765a3e',0,.95,1.82,tower);
  root.add(tower);
  for(const [x,z,a] of h.boats) {
    const boat=new THREE.Group();boat.position.set(x,world.waterLevel+.15,z);boat.rotation.y=a;
    part(new THREE.SphereGeometry(1,12,8).scale(1.25,.65,3.8),'#654c37',0,0,0,boat);
    part(new THREE.BoxGeometry(2.15,.15,5.8),'#c1a274',0,.3,0,boat);
    part(new THREE.CylinderGeometry(.08,.12,6,6),'#8a6945',0,3.2,0,boat);
    part(new THREE.BoxGeometry(2.6,3.9,.045),'#f0e5c6',.55,3.7,0,boat);
    root.add(boat);
  }
  for(const [x,z,kind] of h.signs) {
    const y=world.groundY(x,z);
    part(new THREE.BoxGeometry(.18,2.3,.18),'#80623f',0,0,0).position.set(x,y+1.15,z);
    part(new THREE.BoxGeometry(1.8,.7,.16),'#dbbd83',x,y+1.9,z);
    // Simple painted symbols stay readable without DOM labels or font assets.
    const symbol=new THREE.Group();symbol.position.set(x,y+1.9,z+.1);
    if(kind==='fields') part(new THREE.ConeGeometry(.23,.6,3),'#65844a',0,0,0,symbol);
    else {part(new THREE.BoxGeometry(.6,.3,.025),'#426c83',0,-.05,0,symbol);part(new THREE.ConeGeometry(.4,.35,3),'#426c83',0,.2,0,symbol);}
    root.add(symbol);
  }
  for(const [x,z] of h.farmBeds) {
    part(new THREE.BoxGeometry(6,.12,10),'#8b7250',x,world.groundY(x,z)+.06,z);
    for(const offset of [-2,0,2]) part(new THREE.BoxGeometry(.35,.25,9),'#7c9551',x+offset,world.groundY(x,z)+.2,z);
  }
  return root;
}
