// The conch is a loft of expanding whorls into a hand-traced, non-planar lip.
// Screen anchors fit the approved reference; their authored heights give the
// shell real depth, a thick rim and an enclosed inner chamber.
function giantConch(){
  const outer=[],oc=[],inner=[],ic=[],lip=[],lc=[];
  const tri=(ps,cs,a,b,c,tone)=>{for(const p of[a,b,c]){ps.push(p.x,p.y,p.z);cs.push(tone.r,tone.g,tone.b);}};
  const quad=(ps,cs,a,b,c,d,tone)=>{tri(ps,cs,a,b,c,tone);tri(ps,cs,a,c,d,tone);};
  const screen=(u,v,h)=>{const[x,z]=P(u,v,M(h));return new V3(x,M(h),z);};
  // Clockwise from the swept-back crest: a folded throat, round outer wing,
  // long apron on the sand, and the raised columella on the left.
  const rimControls=[
    [.680,.174,4.65],[.676,.212,3.95],[.684,.254,3.25],
    [.708,.267,3.50],[.735,.273,3.40],[.747,.301,2.95],
    [.751,.347,2.30],[.760,.402,1.35],[.775,.463,.35],
    [.786,.501,.045],[.748,.482,.07],[.711,.456,.17],
    [.678,.426,.48],[.653,.401,.92],[.640,.356,1.85],
    [.641,.307,2.65],[.649,.256,3.45],[.662,.207,4.15]
  ];
  const rimCurve=new THREE.CatmullRomCurve3(rimControls.map(p=>screen(...p)),true,'centripetal');
  const rim=a=>rimCurve.getPoint(((Math.PI/2-a)/(Math.PI*2)%1+1)%1);
  const profiles=[
    [0,.447,.291,.002,.004,1.58],
    [.09,.464,.292,.006,.012,1.58],
    [.20,.484,.299,.010,.022,1.60],
    [.32,.507,.311,.015,.035,1.63],
    [.44,.532,.324,.022,.052,1.78],
    [.57,.558,.335,.030,.075,1.98],
    [.70,.587,.328,.039,.108,2.44],
    [.82,.616,.319,.048,.129,2.62]
  ];
  const body=(t,a)=>{
    let i=1;while(i<profiles.length-1&&t>profiles[i][0])i++;
    const A=profiles[i-1],B=profiles[i],f=THREE.MathUtils.clamp((t-A[0])/(B[0]-A[0]),0,1),q=A.map((v,j)=>v+(B[j]-v)*f);
    const seam=.5+.5*Math.cos(t*2*Math.PI*5.8+a*.82);
    const scallop=1+(t>.55?.022:.080)*Math.pow(seam,3),s=Math.sin(a),c=Math.cos(a);
    return screen(q[1]+q[3]*c*scallop+.052*Math.pow(t/.82,2)*Math.max(0,s),q[2]-q[4]*s*scallop,q[5]+q[4]*17*s+.40*Math.pow(t/.82,.7)*c);
  };
  const surface=(t,a)=>{
    if(t<=.82)return body(t,a);
    const f=smooth(.82,1,t),p=body(.82,a).lerp(rim(a),f);
    const view=p.clone().project(camera);
    const depth=M(1.85)*Math.sin(f*Math.PI);
    const y=p.y-depth+M(.04)*Math.sin(f*Math.PI)*Math.cos(a*11+t*13);
    const[x,z]=P((view.x+1)/2,(1-view.y)/2,y);p.set(x,y,z);
    return p;
  };
  const cream=new THREE.Color('#f2e6cc'),ochre=new THREE.Color('#cba87a');
  const n=96,k=56;   // lighter (was 176x96): the shell spans a few hundred pixels at the play camera
  for(let i=0;i<n;i++)for(let j=0;j<k;j++){
    const t=i/n,t1=(i+1)/n,a=j/k*Math.PI*2,b=(j+1)/k*Math.PI*2;
    const seam=Math.pow(.5+.5*Math.cos(t*2*Math.PI*5.8+a*.82),14);
    const weather=Math.pow(Math.max(0,Math.sin(t*31+a*3.1)*Math.sin(a*5.7-t*15)),8);
    const tone=cream.clone().lerp(ochre,seam*(t>.55?.14:.36)+weather*.30);
    quad(outer,oc,surface(t,a),surface(t1,a),surface(t1,b),surface(t,b),tone);
  }
  // A deep off-centre bowl follows the irregular aperture. It cannot read as
  // the straight circular bore of the previous horn-shaped mesh.
  const center=screen(.698,.353,1.64);
  const inset=(a)=>{const p=rim(a),d=p.clone().sub(center).normalize();return p.addScaledVector(d,-M(.085));};
  const chamber=(s,a)=>{
    const p=center.clone().lerp(inset(a),s);
    p.y-=M(.56)*Math.sin(Math.PI*s);
    return p;
  };
  for(let i=0;i<36;i++)for(let j=0;j<k;j++){
    const s=i/36,s1=(i+1)/36,a=j/k*2*Math.PI,b=(j+1)/k*2*Math.PI;
    const tone=new THREE.Color('#ab654c').lerp(new THREE.Color('#efb48e'),Math.pow(s,.67));
    tone.lerp(new THREE.Color('#f5c5a0'),.12*(.5+.5*Math.sin(a*13+s*8)));
    quad(inner,ic,chamber(s,b),chamber(s1,b),chamber(s1,a),chamber(s,a),tone);
  }
  for(let j=0;j<k;j++){
    const a=j/k*2*Math.PI,b=(j+1)/k*2*Math.PI;
    quad(lip,lc,rim(a),rim(b),inset(b),inset(a),new THREE.Color(j%13===0?'#dcb990':'#f9ebcf'));
  }
  const root=new THREE.Group();root.name='Singing Conch — traced folded aperture';
  root.add(shellMesh(outer,oc),shellMesh(inner,ic,true),shellMesh(lip,lc));
  // The stepped shoulders become broader towards the body, with short worn
  // knobs following the whorl rather than a row of identical straight spikes.
  for(const[t,a,h]of[[.17,1.7,.10],[.28,1.65,.13],[.39,1.58,.16],[.49,1.6,.23],[.60,1.55,.26],[.69,1.63,.34]]){
    const p=surface(t,a),g=new THREE.ConeGeometry(M(h*.75),M(h),5);g.translate(0,M(h*.3),0);
    const m=new THREE.Mesh(g,paint({color:'#e9d8b8',shade:[.65,.57,.48],mid:[.92,.83,.70]}));m.position.copy(p);m.rotation.z=-.7;m.castShadow=true;root.add(m);
  }
  // Low irregular footholds anchor the body; the main beach remains open.
  for(const[u,v,r]of[[.535,.352,.65],[.565,.389,1],[.591,.421,1.3],[.625,.443,1.4],[.663,.450,1.1],[.721,.478,.6]]){
    const[x,z]=P(u,v);COLLIDERS.push({x,z,r:M(r)});
  }
  return root;
}
