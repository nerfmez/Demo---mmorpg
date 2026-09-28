// Shared, cached item illustrations on ground loot. One texture per base material.
import * as THREE from 'three';
import { ART } from '../ui/art.js';
const cache = new Map();
const loader = new THREE.TextureLoader();
export function dropSprite(id) {
  if (!ART.material[id]) throw new Error('Missing material artwork: '+id);
  let material=cache.get(id);
  if(!material){
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">'+ART.material[id]+'</svg>';
    const texture=loader.load('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.generateMipmaps=true;
    material=new THREE.SpriteMaterial({map:texture,transparent:true,alphaTest:.06,depthWrite:false});
    cache.set(id,material);
  }
  const sprite=new THREE.Sprite(material);
  sprite.scale.set(1.02,1.02,1);
  return sprite;
}

