// Shared, cached item illustrations on ground loot. One texture per material or gear base.
import * as THREE from 'three';
import { ART } from '../ui/art.js';
import {rasterIconUrl} from '../ui/raster-icons.js';
const cache = new Map();
const loader = new THREE.TextureLoader();
export function dropSprite(id, kind = 'material') {
  if (!ART[kind]?.[id]) throw new Error('Missing ' + kind + ' artwork: '+id);
  const key=kind+'/'+id;
  let material=cache.get(key);
  if(!material){
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">'+ART[kind][id]+'</svg>';
    const source=rasterIconUrl(kind,id) || 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    const texture=loader.load(source);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.generateMipmaps=true;
    material=new THREE.SpriteMaterial({map:texture,transparent:true,alphaTest:.06,depthWrite:false});
    material.userData.shared=true;
    cache.set(key,material);
  }
  const sprite=new THREE.Sprite(material);
  sprite.scale.set(1.02,1.02,1);
  return sprite;
}
