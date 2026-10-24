// Reused ground placement and timber helpers from the accepted Hill Windmill.
function onGround(u,v){
 let hi=M(8),lo=hi;
 for(;lo>0;lo-=.4){const p=P(u,v,lo);if(lo<=height(...p))break;hi=lo;}
 lo=Math.max(0,lo);
 for(let i=0;i<18;i++){const y=(lo+hi)/2,q=P(u,v,y);if(y>height(...q))hi=y;else lo=y;}
 const[x,z]=P(u,v,(hi+lo)/2);return[x,height(x,z),z];
}
function woodBox(x,y,z,w,h,d,color='#947748',ry=0){
 const m=new THREE.Matrix4().compose(new V3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0),ry),new V3(1,1,1));
 woodParts.push(coloredPart(new THREE.BoxGeometry(w,h,d),color,m));
}
function woodBeam(a,b,width,color='#8c6c40'){
 const d=b.clone().sub(a),mat=new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new V3(0,1,0),d.clone().normalize()),new V3(1,1,1));
 woodParts.push(coloredPart(new THREE.BoxGeometry(width,d.length(),width),color,mat));
}
function fenceRun(points){
 const curve=new THREE.CatmullRomCurve3(points.map(p=>new V3(p[0],0,p[1])),false,'centripetal'),n=Math.max(2,Math.ceil(curve.getLength()/M(.72))),pts=curve.getSpacedPoints(n);
 const crossing=p=>{const st=stairsAt(p.x,p.z);return st.a>-.025&&st.a<1.035&&st.s<st.half+.52;};
 for(let i=0;i<pts.length;i++){
  const p=pts[i];if(crossing(p))continue;
  const y=height(p.x,p.z),h=M(.45),w=M(.075);
  woodBox(p.x,y+h/2,p.z,w,h,w,i%3?'#8d7345':'#a0874c');
  woodBox(p.x,y+h+.035,p.z,w*1.16,.08,w*1.16,'#c0a56a');
  COLLIDERS.push({x:p.x,z:p.z,r:w*.60});
  if(i){const q=pts[i-1];if(crossing(q)||crossing(p.clone().add(q).multiplyScalar(.5)))continue;const qy=height(q.x,q.z);for(const f of[.36,.78])woodBeam(new V3(q.x,qy+h*f,q.z),new V3(p.x,y+h*f,p.z),M(.044),f>.5?'#b49858':'#a1854c');COLLIDERS.push({seg:true,x:q.x,z:q.z,x1:p.x,z1:p.z,r:M(.04)});}
 }
}
