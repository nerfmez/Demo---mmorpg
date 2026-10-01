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

// An anime-style coconut frond (canvas top = tip, bottom = crown): one solid leaf mass, narrow
// at the stalk, widest about three quarters out and drawn to a point, broken by a few big
// V-notches along both edges instead of hundreds of thin leaflets. Cel-shaded in flat tones —
// a sunlit half and a shaded half either side of a pale midrib — with a soft same-hue rim and a
// handful of short separation strokes.
let frond;
export function palmFrondTexture() {
 if(frond)return frond;
 const W=256,H=1024,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
 const c=canvas.getContext('2d'),rng=createRng(1307),cx=W/2,top=H*.02,bottom=H*.99;
 const yAt=s=>bottom-(bottom-top)*s; // s: 0 at the crown, 1 at the tip
 const half=s=>W*(.05+.42*Math.pow(Math.sin(Math.PI*Math.pow(Math.min(1,s),1.9)),.75));
 const outline=side=>{const pts=[];for(let k=0;k<=60;k++){const s=k/60;pts.push([cx+side*half(s),yAt(s)]);}return pts;};
 const fillHalf=(side,col)=>{
  c.fillStyle=col;c.beginPath();c.moveTo(cx,yAt(0));
  for(const p of outline(side))c.lineTo(...p);c.lineTo(cx,yAt(1));c.closePath();c.fill();
 };
 fillHalf(-1,'#5e9e48');fillHalf(1,'#8cc85f');
 // a deeper band at the crown end and a warm sunlit band toward the tip, in flat cel steps
 c.globalCompositeOperation='source-atop';
 c.fillStyle='rgba(40,80,35,.28)';c.fillRect(0,yAt(.16),W,bottom-yAt(.16));
 c.fillStyle='rgba(225,240,150,.18)';c.fillRect(0,0,W,yAt(.72));
 c.globalCompositeOperation='source-over';
 // soft rim in a darker green of the same hue
 c.strokeStyle='#4a843c';c.lineWidth=3;c.lineJoin='round';
 for(const side of [-1,1]){c.beginPath();outline(side).forEach((p,k)=>k?c.lineTo(...p):c.moveTo(...p));c.stroke();}
 // a few short separation strokes on the leaf blade
 c.strokeStyle='rgba(55,100,45,.55)';c.lineWidth=2.2;c.lineCap='round';
 for(const side of [-1,1])for(let k=0;k<6;k++){
  const s=.3+k*.1+rng.range(-.02,.02),y=yAt(s),h=half(s);
  c.beginPath();c.moveTo(cx+side*h*.92,y);c.lineTo(cx+side*h*.45,y+h*.35);c.stroke();
 }
 // big V-notches cut from both edges, opening outward and pointing back toward the crown
 c.globalCompositeOperation='destination-out';c.fillStyle='#000';
 for(const side of [-1,1]){
  let s=.24+rng.range(0,.04);
  while(s<.93){
   const width=rng.range(.045,.07),h=half(s+width/2),depth=rng.range(.42,.62);
   c.beginPath();
   c.moveTo(cx+side*(half(s)+2),yAt(s));
   c.lineTo(cx+side*h*(1-depth),yAt(s+width*.2));
   c.lineTo(cx+side*(half(s+width)+2),yAt(s+width));
   c.closePath();c.fill();
   s+=width+rng.range(.06,.1);
  }
 }
 c.globalCompositeOperation='source-over';
 // pale midrib from the crown to just short of the tip
 c.strokeStyle='#cfe08e';c.lineCap='round';
 for(let k=0;k<20;k++){const s0=k/20*.96,s1=(k+1)/20*.96;c.lineWidth=7-5.5*s0;c.beginPath();c.moveTo(cx,yAt(s0));c.lineTo(cx,yAt(s1));c.stroke();}
 frond=new THREE.CanvasTexture(canvas);frond.colorSpace=THREE.SRGBColorSpace;frond.anisotropy=4;return frond;
}
