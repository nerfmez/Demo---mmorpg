// Static waterline cross-sections of the rendered props. One bake at scene creation;
// no per-frame raycasts, particles or alternative water/collision system.
import * as THREE from 'three';

export function ownContactTexture(material, texture) {
  let released=false;
  material.addEventListener('dispose',()=>{if(!released){texture.dispose();released=true;}});
}

function crossSection(root, level) {
  const segments=[],seen=new Set(),matrix=new THREE.Matrix4(),instance=new THREE.Matrix4();
  const vertices=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  const bounds=new THREE.Box3();
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.material?.side===THREE.BackSide)return;
    const geometry=mesh.geometry,positions=geometry?.attributes.position;
    if(!positions)return;
    geometry.computeBoundingBox();
    for(let n=0;n<(mesh.isInstancedMesh?mesh.count:1);n++){
      matrix.copy(mesh.matrixWorld);
      if(mesh.isInstancedMesh){mesh.getMatrixAt(n,instance);matrix.multiply(instance);}
      bounds.copy(geometry.boundingBox).applyMatrix4(matrix);
      if(bounds.min.y>level||bounds.max.y<level)continue;
      const index=geometry.index,count=index?.count??positions.count;
      for(let i=0;i<count;i+=3){
        for(let k=0;k<3;k++)vertices[k].fromBufferAttribute(positions,index?index.getX(i+k):i+k).applyMatrix4(matrix);
        const hits=[];
        for(let k=0;k<3;k++){
          const a=vertices[k],b=vertices[(k+1)%3],da=a.y-level,db=b.y-level;
          if(Math.abs(da)<1e-7&&Math.abs(db)<1e-7)continue;
          if((da<=0&&db>=0)||(da>=0&&db<=0)){
            const t=da/(da-db),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
            if(!hits.some(p=>Math.hypot(p[0]-x,p[1]-z)<1e-6))hits.push([x,z]);
          }
        }
        if(hits.length!==2||Math.hypot(hits[0][0]-hits[1][0],hits[0][1]-hits[1][1])<1e-6)continue;
        const keys=hits.map(p=>p.map(v=>Math.round(v*10000)).join(',')).sort(),key=keys.join('/');
        if(!seen.has(key)){seen.add(key);segments.push([...hits[0],...hits[1]]);}
      }
    }
  });
  return segments;
}

function connectedLoops(segments) {
  // Color batches can contain several overlapping closed objects (a mast within
  // a hull, adjoining masonry boxes). Union their loops; whole-batch even/odd
  // filling would punch spurious water holes through those nested solids.
  const parents=segments.map((_,i)=>i),nodes=new Map();
  const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  for(let i=0;i<segments.length;i++)for(const p of [segments[i].slice(0,2),segments[i].slice(2)]){
    const key=p.map(v=>Math.round(v*10000)).join(',');
    if(nodes.has(key))parents[find(i)]=find(nodes.get(key));else nodes.set(key,i);
  }
  const loops=new Map();
  for(let i=0;i<segments.length;i++){const key=find(i);if(!loops.has(key))loops.set(key,[]);loops.get(key).push(segments[i]);}
  return [...loops.values()];
}

export function bakeWaterContact(world, scenery) {
  const settings=world.data.sea.surf||{},shore=world.data.sea.coastline || world.data.sea.shore;
  // Distant mainland closure points are not visible contact scenery. Clip the
  // bake to the playable coast so they cannot spend resolution needed by piles.
  const b=world.data.bounds;
  const minX=Math.max(Math.min(...shore.map(p=>p[0]))-6,b?b.minX-6:-Infinity),maxX=Math.min(Math.max(...shore.map(p=>p[0]))+6,b?b.maxX+6:Infinity);
  const minZ=Math.max(Math.min(...shore.map(p=>p[1]))-6,b?b.minZ-6:-Infinity),maxZ=Math.min(Math.max(...shore.map(p=>p[1]))+18,b?b.maxZ+18:Infinity);
  const texel=Math.max(settings.contactTexel??.16,(maxX-minX)/2048,(maxZ-minZ)/2048);
  const w=Math.ceil((maxX-minX)/texel),h=Math.ceil((maxZ-minZ)/texel),range=settings.contactRange??2.4;
  const mask=new Uint8Array(w*h),distance=new Float32Array(w*h).fill(range);
  const nx=new Float32Array(w*h),nz=new Float32Array(w*h);
  const sections=[];
  scenery?.updateMatrixWorld(true);
  scenery?.traverse(root=>{if(root.userData.waterContact)sections.push(...connectedLoops(crossSection(root,world.waterLevel+.015)));});
  const gridX=x=>Math.max(0,Math.min(w-1,Math.floor((x-minX)/texel)));
  const gridZ=z=>Math.max(0,Math.min(h-1,Math.floor((z-minZ)/texel)));
  for(const segments of sections){
    // Fill each section independently, then union. Raised pier decks never enter
    // this mask; only their actual submerged piles interrupt the water surface.
    let lo=Infinity,hi=-Infinity;
    for(const s of segments){lo=Math.min(lo,s[1],s[3]);hi=Math.max(hi,s[1],s[3]);}
    for(let j=gridZ(lo);j<=gridZ(hi);j++){
      const z=minZ+(j+.5)*texel,crossings=[];
      for(const [ax,az,bx,bz] of segments)if((az<=z&&bz>z)||(bz<=z&&az>z))crossings.push(ax+(bx-ax)*(z-az)/(bz-az));
      crossings.sort((a,b)=>a-b);
      for(let k=0;k+1<crossings.length;k+=2)for(let i=gridX(crossings[k]);i<=gridX(crossings[k+1]);i++){
        const x=minX+(i+.5)*texel;if(x>=crossings[k]&&x<=crossings[k+1])mask[j*w+i]=1;
      }
    }
    for(const [ax,az,bx,bz] of segments){
      const vx=bx-ax,vz=bz-az,length2=vx*vx+vz*vz;
      for(let j=gridZ(Math.min(az,bz)-range);j<=gridZ(Math.max(az,bz)+range);j++)for(let i=gridX(Math.min(ax,bx)-range);i<=gridX(Math.max(ax,bx)+range);i++){
        const x=minX+(i+.5)*texel,z=minZ+(j+.5)*texel,t=Math.max(0,Math.min(1,((x-ax)*vx+(z-az)*vz)/length2));
        const dx=x-ax-vx*t,dz=z-az-vz*t,d=Math.hypot(dx,dz),k=j*w+i;
        if(d<distance[k]){distance[k]=d;nx[k]=dx/Math.max(d,1e-6);nz[k]=dz/Math.max(d,1e-6);}
      }
    }
  }
  const bytes=new Uint8Array(w*h*4),shelter=settings.contactShelter??8;
  for(let i=0;i<w;i++){
    let lee=Infinity;
    // Incoming waves travel north from the open southern bay. Occluded water
    // behind solid stone/boat sections recovers gradually instead of a hard cut.
    for(let j=h-1;j>=0;j--){
      const k=j*w+i,solid=mask[k];lee=solid?0:lee+texel;
      const d=distance[k]*(solid?-1:1);
      bytes[k*4]=Math.round(255*(.5+d/(range*2)));
      bytes[k*4+1]=Math.round(255*(.5+nx[k]*(solid?-1:1)*.5));
      bytes[k*4+2]=Math.round(255*(.5+nz[k]*(solid?-1:1)*.5));
      bytes[k*4+3]=Math.round(255*(.12+.88*Math.min(1,lee/shelter)));
    }
  }
  const texture=new THREE.DataTexture(bytes,w,h,THREE.RGBAFormat);
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  return {texture,bounds:new THREE.Vector4(minX,minZ,w*texel,h*texel),range,sections:sections.length,segments:sections.reduce((n,s)=>n+s.length,0),texel};
}
