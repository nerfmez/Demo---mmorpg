// The Singing Conch: a real coiled shell. Whorls grow along a logarithmic
// spiral round the coiling axis, with a knobbed shoulder on every whorl, a
// long siphonal canal, a thin flared lip and a pink aperture. It is modelled
// in its own frame, then laid on the sand so its spire points to the
// concept's spire tip and its body lies along the concept's footprint.
function giantConch(){
  const screen=(u,v,h)=>{const[x,z]=P(u,v,M(h));return new V3(x,M(h),z);};
  // Shell parameters (unit body whorl). b: growth per radian; D: whorl offset
  // from the axis; a, c: radial and axial half widths; H: axial descent.
  const TURNS=6,b=Math.log(60)/(TURNS*2*Math.PI),D=.72,A=.74,C=.88,H=3.1,KNOBS=9,CANAL=.55;
  const shape=(th,s,inner)=>{
    const r=Math.exp(b*th),last=smooth(-2*Math.PI,0,th),lip=smooth(-.55*Math.PI,0,th);
    const cs=Math.cos(s),sn=Math.sin(s);
    // knobs on the shoulder (the side of the whorl towards the apex), softer on the body whorl
    const knob=1+(.34-.16*last)*Math.pow(Math.max(0,sn*.8+cs*.6),4)*Math.pow(.5+.5*Math.cos(KNOBS*th),3);
    let a=A*knob,c=C*(1+CANAL*last*Math.pow(Math.max(0,-sn),3));   // the canal draws the body whorl down
    let rho=D*r+a*r*cs,z=-H*r+c*r*sn;
    // the mouth opens like a horn: the last part of the whorl widens all round,
    // with a thin lip turned out at the rim
    const bell=(1+.3*lip*lip+.3*Math.pow(lip,6))*(1+.07*Math.pow(lip,10)*Math.sin(s*7+1.3));   // a wavy, flared lip
    rho=D*r+(rho-D*r)*bell;z=-H*r+(z+H*r)*bell;
    if(inner){rho-=r*.07*cs;z-=r*.07*sn;}
    return new V3(rho*Math.cos(th),rho*Math.sin(th),z);
  };
  // Lay the shell on its side as in the concept: the spire points left (and a
  // little up and towards the camera), the mouth opens to the right and
  // towards the camera, and the shell sits on the sand over its footprint.
  const SPIRE=[.1,-.4],MOUTH=[.7,.9,.15],SIZE=M(1.9);
  const focus=screen(.60,.38,0),right=new V3(1,0,0).applyQuaternion(camera.quaternion);right.y=0;right.normalize();
  const toCam=new V3().subVectors(camera.position,focus);toCam.y=0;toCam.normalize();const up=new V3(0,1,0);
  const Zw=right.clone().negate().addScaledVector(up,SPIRE[0]).addScaledVector(toCam,SPIRE[1]).normalize();
  const Yw=right.clone().multiplyScalar(MOUTH[0]).addScaledVector(toCam,MOUTH[1]).addScaledVector(up,MOUTH[2]);Yw.addScaledVector(Zw,-Yw.dot(Zw)).normalize();
  // A left-handed (sinistral) shell, so its flared outer lip rises over the mouth as in the concept.
  const Xw=new V3().crossVectors(Zw,Yw).normalize();
  const frame=new THREE.Matrix4().makeBasis(Xw.multiplyScalar(SIZE),Yw.multiplyScalar(SIZE),Zw.multiplyScalar(SIZE));
  {const box=new THREE.Box3();for(let th=-TURNS*2*Math.PI;th<=0;th+=.3)for(let s=0;s<6.3;s+=.4)box.expandByPoint(shape(th,s,false).applyMatrix4(frame));
   const c=box.getCenter(new V3());frame.setPosition(focus.x-c.x,height(focus.x,focus.z)-box.min.y-SIZE*.04,focus.z-c.z);}
  // One indexed grid per surface; smooth normals at little cost.
  const NT=Math.round(TURNS*36),NS=40,th0=-TURNS*2*Math.PI;
  const grid=(t0,t1,nt,inner,tone)=>{
    const pos=[],col=[],idx=[],c=new THREE.Color();
    for(let i=0;i<=nt;i++)for(let j=0;j<=NS;j++){
      const th=t0+(t1-t0)*i/nt,s=j/NS*2*Math.PI,p=shape(th,s,inner).applyMatrix4(frame);
      pos.push(p.x,p.y,p.z);tone(th,s,c);col.push(c.r,c.g,c.b);
    }
    for(let i=0;i<nt;i++)for(let j=0;j<NS;j++){const q=i*(NS+1)+j;idx.push(q,q+NS+1,q+1,q+1,q+NS+1,q+NS+2);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
    return g;
  };
  const cream=new THREE.Color('#f3e7cd'),ochre=new THREE.Color('#c9a273'),sand=new THREE.Color('#dcc39b'),blush=new THREE.Color('#e9c2a2');
  const outer=grid(th0,0,NT,false,(th,s,c)=>{
    // growth lines across the whorl, ochre spiral bands, a blush on the lip
    const growth=Math.pow(.5+.5*Math.cos(th*KNOBS),10),band=Math.pow(.5+.5*Math.sin(s*3+th*.4),12);
    c.copy(cream).lerp(ochre,growth*.22+band*.18).lerp(sand,.25*smooth(-2,-8,th/Math.PI)).lerp(blush,.55*smooth(-.35*Math.PI,0,th)*Math.max(0,Math.cos(s)));
  });
  const pink=new THREE.Color('#f6c8a6'),deep=new THREE.Color('#8f4436');
  // deeper inside the whorl and towards the columella the pink darkens, so the mouth reads as a hollow
  const inside=grid(-1.5*Math.PI,0,Math.round(1.5*22),true,(th,s,c)=>c.copy(deep).lerp(pink,Math.pow(smooth(-.5*Math.PI,0,th),1.2)*(.45+.55*smooth(-.6,.9,Math.cos(s)))));
  // the lip's thickness: a pale rim joining the outer and inner edges
  const rimPos=[],rimCol=[],rimIdx=[],rimTone=new THREE.Color('#fbf0dc');
  for(let j=0;j<=NS;j++){const s=j/NS*2*Math.PI;for(const p of[shape(0,s,false),shape(0,s,true)]){p.applyMatrix4(frame);rimPos.push(p.x,p.y,p.z);rimCol.push(rimTone.r,rimTone.g,rimTone.b);}}
  for(let j=0;j<NS;j++){const q=j*2;rimIdx.push(q,q+1,q+2,q+2,q+1,q+3);}
  const rim=new THREE.BufferGeometry();rim.setAttribute('position',new THREE.Float32BufferAttribute(rimPos,3));rim.setAttribute('color',new THREE.Float32BufferAttribute(rimCol,3));rim.setIndex(rimIdx);rim.computeVertexNormals();
  const root=new THREE.Group();root.name='Singing Conch — coiled shell';
  for(const[g,inner]of[[outer,false],[inside,true],[rim,false]]){const m=new THREE.Mesh(g,shellMaterial(inner));m.castShadow=m.receiveShadow=true;root.add(m);}
  // Low irregular footholds anchor the body; the main beach remains open.
  for(const[u,v,r]of[[.535,.352,.65],[.565,.389,1],[.591,.421,1.3],[.625,.443,1.4],[.663,.450,1.1],[.721,.478,.6]]){
    const[x,z]=P(u,v);COLLIDERS.push({x,z,r:M(r)});
  }
  return root;
}
