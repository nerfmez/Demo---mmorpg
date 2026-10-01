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

// A coconut-palm frond, rachis running down the middle (u=.5) from base (bottom, v=1) to tip (top).
// Many long, narrow, tapered leaflets in mixed greens sweep from the rachis toward the tip and
// overlap a little, longest at mid-frond, with a few split or missing; small gaps stay clear.
let frond;
export function palmFrondTexture() {
 if(frond)return frond;
 const W=256,H=1024,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
 const c=canvas.getContext('2d'),rng=createRng(1307),cx=W/2;
 const greens=['#4c8a3e','#589844','#64a54b','#72b153','#80bc5c','#8fc666'];
 const tipGreens=['#9bcf6c','#aad87a','#bce287'];
 // a tapered leaflet along a gentle curve, filled, with a lighter upper half
 const leaflet=(x0,y0,x1,y1,bx,by,width,col,light)=>{
  const pts=[],n=14;
  for(let k=0;k<=n;k++){const t=k/n,u=1-t;pts.push([u*u*x0+2*u*t*bx+t*t*x1,u*u*y0+2*u*t*by+t*t*y1]);}
  const left=[],right=[];
  for(let k=0;k<=n;k++){
   const a=pts[Math.max(0,k-1)],b=pts[Math.min(n,k+1)],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;
   const w=width*Math.pow(Math.sin(Math.PI*Math.min(1,.08+k/n*.95)),.7)*.5;
   left.push([pts[k][0]-dy/l*w,pts[k][1]+dx/l*w]);right.push([pts[k][0]+dy/l*w,pts[k][1]-dx/l*w]);
  }
  c.fillStyle=col;c.beginPath();c.moveTo(...left[0]);for(const p of left)c.lineTo(...p);for(const p of right.reverse())c.lineTo(...p);c.closePath();c.fill();
  c.strokeStyle=light;c.lineWidth=Math.max(1,width*.18);c.beginPath();c.moveTo(...pts[1]);for(const p of pts.slice(2,n))c.lineTo(...p);c.stroke();
 };
 const count=96;
 for(let i=0;i<count;i++){
  const t=i/count,y=H*.03+t*H*.95; // t=0 at the tip, 1 at the base
  const reach=(Math.pow(Math.sin(Math.PI*Math.min(1,(1-t)*.98+.05)),.5)*.46+.03)*W;
  for(const side of [-1,1]){
   if(rng.next()<.05)continue;
   const len=reach*rng.range(.85,1.0),rise=len*rng.range(.55,.75);
   const tipish=rng.next()<.2+.45*(1-t);
   const col=tipish?tipGreens[Math.floor(rng.next()*tipGreens.length)]:greens[Math.floor(rng.next()*greens.length)];
   const x0=cx+side*4,x1=cx+side*len,y1=y-rise,bx=cx+side*len*.6,by=y-rise*.2+rng.range(-4,8);
   leaflet(x0,y,x1,y1,bx,by,rng.range(11,16)*(.65+.35*t),col,'rgba(225,240,170,.35)');
   if(rng.next()<.08){c.strokeStyle='#000';c.globalCompositeOperation='destination-out';c.lineWidth=2.5;
    c.beginPath();c.moveTo(cx+side*len*.55,y-rise*.45);c.lineTo(x1,y1+6);c.stroke();c.globalCompositeOperation='source-over';}
  }
 }
 const grad=c.createLinearGradient(0,H,0,0);grad.addColorStop(0,'#cfc47c');grad.addColorStop(1,'#93bb62');
 c.strokeStyle=grad;c.lineCap='round';
 for(let k=0;k<24;k++){const y=H*k/24,y2=H*(k+1)/24;c.lineWidth=3+10*((k+1)/24);c.beginPath();c.moveTo(cx,y);c.lineTo(cx,y2+1);c.stroke();}
 frond=new THREE.CanvasTexture(canvas);frond.colorSpace=THREE.SRGBColorSpace;frond.anisotropy=4;return frond;
}
