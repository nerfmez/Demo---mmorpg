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
// Calm on purpose: a modest number of broad, tapered leaflets with clear gaps between them, each
// shaded from a deeper green at the stalk to a sunlit tip, leafed full right down to the crown.
let frond;
export function palmFrondTexture() {
 if(frond)return frond;
 const W=256,H=1024,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
 const c=canvas.getContext('2d'),rng=createRng(1307),cx=W/2;
 const leaflet=(x0,y0,x1,y1,bx,by,width,col)=>{
  const pts=[],n=14;
  for(let k=0;k<=n;k++){const t=k/n,u=1-t;pts.push([u*u*x0+2*u*t*bx+t*t*x1,u*u*y0+2*u*t*by+t*t*y1]);}
  const left=[],right=[];
  for(let k=0;k<=n;k++){
   const a=pts[Math.max(0,k-1)],b=pts[Math.min(n,k+1)],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;
   const w=width*Math.pow(Math.sin(Math.PI*Math.min(1,.08+k/n*.95)),.7)*.5;
   left.push([pts[k][0]-dy/l*w,pts[k][1]+dx/l*w]);right.push([pts[k][0]+dy/l*w,pts[k][1]-dx/l*w]);
  }
  const g=c.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,col[0]);g.addColorStop(1,col[1]);
  c.fillStyle=g;c.beginPath();c.moveTo(...left[0]);for(const p of left)c.lineTo(...p);for(const p of right.reverse())c.lineTo(...p);c.closePath();c.fill();
 };
 const count=21,pitch=H*.96/count;
 const shades=[['#5a9845','#9ccd6c'],['#62a04b','#a8d476'],['#55913f','#93c565']];
 for(let i=0;i<count;i++){
  const t=i/count,y=H*.04+t*H*.96; // t=0 at the tip, 1 at the crown: leafed all the way down
  // full length through the middle, tapering to the tip, still broad at the crown end
  const reach=(t<.5?Math.pow(Math.sin(Math.PI*(.06+t*.94)),.5)*.45+.04:.49-.12*(t-.5)/.5)*W;
  for(const side of [-1,1]){
   const len=reach*rng.range(.9,1.0),rise=len*.62;
   // each leaflet darkens toward the stalk and lightens to its tip; neighbours differ a little
   leaflet(cx+side*4,y,cx+side*len,y-rise,cx+side*len*.6,y-rise*.2,Math.min(pitch*.7,26),shades[Math.floor(rng.next()*shades.length)]);
  }
 }
 c.strokeStyle='#a9bd6a';c.lineCap='round';
 for(let k=0;k<24;k++){const y=H*.04+(H*.96)*k/24,y2=H*.04+(H*.96)*(k+1)/24;c.lineWidth=3+8*((k+1)/24);c.beginPath();c.moveTo(cx,y);c.lineTo(cx,y2+1);c.stroke();}
 frond=new THREE.CanvasTexture(canvas);frond.colorSpace=THREE.SRGBColorSpace;frond.anisotropy=4;return frond;
}
