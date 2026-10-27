import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {registerHooks} from 'node:module';
import {loadData} from '../../src/core/data-node.js';

const hook=registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{...context.importAttributes,type:'json'}}:context);}});
const {animeFoliage}=await import('../../src/render/anime-study.js');
hook.deregister();
const data=loadData();

test('a map\'s look.foliage colours its crowns; without one the game palette stays',()=>{
 const look=data.maps['moonroot-grove-v1'].look.foliage,teal=look.leaf.map(c=>new THREE.Color(c));
 const mean=g=>{const c=g.attributes.color,s=[0,0,0];for(let i=0;i<c.count;i++){s[0]+=c.getX(i);s[1]+=c.getY(i);s[2]+=c.getZ(i);}return s.map(v=>v/c.count);};
 const plain=mean(animeFoliage(3,false)),own=mean(animeFoliage(3,false,look));
 assert.notDeepEqual(own,plain);
 // Moonroot's teal: bluer than the game's yellow-green leaves, within its own palette's range
 assert.ok(own[2]/own[1]>plain[2]/plain[1],'bluer');
 const lo=Math.min(...teal.map(c=>c.g)),hi=Math.max(...teal.map(c=>c.g));
 assert.ok(own[1]>lo*.5&&own[1]<hi*1.2,'within the palette');
 const shrub=mean(animeFoliage(11,true,look)),plainShrub=mean(animeFoliage(11,true));
 assert.ok(shrub[2]/shrub[1]>plainShrub[2]/plainShrub[1],'shrubs too');
});

test('a map\'s look.trunk recolours its bark; mossy stones carry moss only on their tops',async()=>{
 const {animeTrunk}=await import('../../src/render/anime-study.js');
 const {mossyStone}=await import('../../src/render/moonroot-flora.js');
 const bark=data.maps['moonroot-grove-v1'].look.trunk;
 const mean=g=>{const c=g.attributes.color,s=[0,0,0];for(let i=0;i<c.count;i++){s[0]+=c.getX(i);s[1]+=c.getY(i);s[2]+=c.getZ(i);}return s.map(v=>v/c.count);};
 const own=mean(animeTrunk(bark)),plain=mean(animeTrunk());
 assert.ok(own[2]/own[0]>plain[2]/plain[0],'greyer, less red bark');
 const s=mossyStone('#8fb060'),c=s.attributes.color,n=s.attributes.normal;
 let topMoss=0,sideMoss=0;
 for(let i=0;i<c.count;i++){const mossy=c.getX(i)<.9;if(n.getY(i)>.9&&mossy)topMoss++;if(n.getY(i)<.2&&mossy)sideMoss++;}
 assert.ok(topMoss>0,'moss on top');assert.equal(sideMoss,0,'no moss on the sides');
});
