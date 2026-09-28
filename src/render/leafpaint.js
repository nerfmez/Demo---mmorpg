// A shared hand-composed leaf-cluster atlas. Canvas is built once; alpha-tested instancing
// gives small lobed silhouettes instead of polygon balls, with no transparent sorting.
import * as THREE from 'three';
import {createRng} from '../core/rng.js';
let texture;
export function leafTexture() {
 if(texture)return texture;
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
 const c=canvas.getContext('2d'),rng=createRng(771);
 const palette=['#58734d','#648255','#75905e','#849e6a','#99b27c','#afc68f'];
 const leaf=(x,y,r,a,col)=>{
  c.save();c.translate(x,y);c.rotate(a);c.fillStyle=col;
  c.beginPath();c.moveTo(-r,0);c.bezierCurveTo(-r*.55,-r*.66,r*.44,-r*.48,r,0);c.bezierCurveTo(r*.35,r*.40,-r*.3,r*.70,-r,0);c.fill();c.restore();
 };
 // Broad masses establish a calm three-band value structure; small leaf sprays shape edges.
 for(let row=0;row<11;row++){
  const y=430-row*33,span=Math.sqrt(Math.max(0,1-Math.pow((y-263)/215,2)))*188;
  for(let x=256-span;x<256+span;x+=29){
   const xx=x+rng.range(-12,12),yy=y+rng.range(-10,10),rr=rng.range(26,43);
   const level=Math.min(4,Math.max(0,Math.floor((430-yy)/93)+(xx<255?1:0)));
   for(let k=0;k<5;k++)leaf(xx+Math.sin(k*1.256)*rr*.42,yy+Math.cos(k*1.256)*rr*.32,rr*.69,k*1.256,palette[level]);
   for(let k=0;k<3;k++)leaf(xx+rng.range(-rr*.3,rr*.3),yy+rng.range(-rr*.3,rr*.3),rr*.39,rng.range(-.8,.8),palette[Math.min(5,level+1)]);
  }
 }
 // Individually shaped peripheral leaves keep the silhouette loose and asymmetric.
 for(let i=0;i<55;i++){
  const a=i*2.39996,r=184+rng.range(-20,8),x=256+Math.cos(a)*r,y=260+Math.sin(a)*r*.96;
  const col=palette[Math.min(4,Math.max(0,Math.floor((425-y)/85)))];
  leaf(x,y,rng.range(10,20),a,col);
 }
 texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 texture.anisotropy=4;return texture;
}

let needles;
export function needleTexture() {
 if(needles)return needles;
 const canvas=document.createElement('canvas');canvas.width=384;canvas.height=512;
 const c=canvas.getContext('2d'),rng=createRng(499);
 for(let tier=0;tier<10;tier++){
  const y=451-tier*38,span=159-tier*14;
  c.fillStyle=tier%3===0?'#345a36':tier%3===1?'#436e3b':'#527f41';
  c.beginPath();c.moveTo(192,y-135);c.lineTo(192-span,y+17);
  for(let i=0;i<16;i++){const x=192-span+(span*2*i/15);c.lineTo(x,y+rng.range(-5,29));}c.closePath();c.fill();
  for(let k=0;k<24;k++){
   const x=192+rng.range(-span*.83,span*.83),yy=y-Math.abs(x-192)*.15+rng.range(-38,6);
   c.strokeStyle=k%3===0?'#89a954':'#648d46';c.lineWidth=rng.range(3,5);c.lineCap='round';
   c.beginPath();c.moveTo(x,yy);c.lineTo(x+(x-192)*.055,yy+12);c.stroke();
  }
 }
 needles=new THREE.CanvasTexture(canvas);needles.colorSpace=THREE.SRGBColorSpace;needles.anisotropy=4;return needles;
}
