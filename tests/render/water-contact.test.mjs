import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {data} from '../core/helpers.js';
import {createWorld} from '../../src/core/world.js';
import {fromBoxLocal} from '../../src/core/math.js';
import {createHarbor} from '../../src/render/harbor.js';
import {marketQuay} from '../../src/render/market.js';
import {bakeWaterContact,ownContactTexture} from '../../src/render/water-contact.js';
const world=createWorld(data.world),scenery=new THREE.Group();
scenery.add(createHarbor(world),marketQuay(world));
const field=bakeWaterContact(world,scenery);
const sample=(x,z)=>{
 const i=Math.floor((x-field.bounds.x)/field.texel),j=Math.floor((z-field.bounds.y)/field.texel),k=(j*field.texture.image.width+i)*4,b=field.texture.image.data;
 return {distance:(b[k]/255-.5)*field.range*2,exposure:b[k+3]/255};
};
test('actual hulls, rotated stone base and piles intersect water; raised timber decks do not',()=>{
 for(const [x,z] of world.data.harbor.boats)assert.ok(sample(x,z).distance<0,`boat ${x},${z}`);
 const pier=world.docks.find(d=>d.id==='market_west');
 assert.ok(sample(pier.x,pier.z).distance>1,'water may pass below elevated deck');
 const pile=fromBoxLocal(pier,pier.hx-.2,pier.hz-.3);
 assert.ok(sample(pile.x,pile.z).distance<0,'actual pile blocks surface');
 const d=world.docks.find(d=>d.kind==='breakwater');
 for(const z of [-8,0,8]){const p=fromBoxLocal(d,0,z);assert.ok(sample(p.x,p.z).distance<0,'solid rotated masonry');}
});
test('waterline uses tapered hull, not a rectangular building footprint',()=>{
 const [x,z,angle]=world.data.harbor.boats[0],boat={x,z,angle};
 assert.ok(sample(x,z).distance<0);
 for(const lx of [0,1.2]){const p=fromBoxLocal(boat,lx,3.5);assert.ok(sample(p.x,p.z).distance>0,'waterline is narrower/shorter than upper gunwale');}
 const pier=world.docks.find(d=>d.id==='market_west'),p=fromBoxLocal(pier,0,pier.hz-.5);
 assert.ok(sample(p.x,p.z).distance>0,'open centre below deck, between its piles');
});
test('incoming exposure is reduced behind the physical hull and recovers in open water',()=>{
 const [x,z]=world.data.harbor.boats[0];
 assert.ok(sample(x,z-4).exposure<sample(x,z+4.3).exposure);
 assert.equal(sample(0,60).exposure,1);
});
test('above-water decoration creates no contact and texture is owned/disposed exactly once',()=>{
 const w={waterLevel:0,data:{sea:{shore:[[-5,-2],[5,-2]],surf:{contactTexel:.1}}}};
 const root=new THREE.Group();root.userData.waterContact=true;
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,1,2),new THREE.MeshBasicMaterial());mesh.position.y=3;root.add(mesh);
 const dry=bakeWaterContact(w,root);assert.equal(dry.sections,0);dry.texture.dispose();mesh.geometry.dispose();mesh.material.dispose();
 const mat=new THREE.ShaderMaterial();ownContactTexture(mat,field.texture);
 let disposed=0;field.texture.addEventListener('dispose',()=>disposed++);
 mat.dispose();mat.dispose();assert.equal(disposed,1);
});
