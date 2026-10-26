// Startup-only landscape kit: solid outcrops, rooted caps,
// and broken masonry. Each bounded cell is owned/disposed by its resident region.
import * as THREE from 'three';
import art from '../../data/landscape-art.json' with {type:'json'};
import { createRng } from '../core/rng.js';
import { toon } from './toon.js';
import { patchMaterial } from './patch.js';
import { paintSurface } from './surfaceart.js';

function rockPaint(material){
  const previous=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRockPosition; varying vec3 vRockNormal;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvRockPosition=position; vRockNormal=normal;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vRockPosition; varying vec3 vRockNormal;
vec2 rockHash(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
{
  vec3 n=abs(vRockNormal); vec2 p=vec2(n.x>n.z?vRockPosition.z:vRockPosition.x,vRockPosition.y)*.64;
  p.x+=p.y*.21; vec2 cell=floor(p),q=fract(p); float first=8.0,second=8.0,shade=0.0;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 id=cell+vec2(float(i),float(j)),h=rockHash(id),r=vec2(float(i),float(j))+.18+h*.64-q;
    float d=dot(r,r);
    if(d<first){second=first;first=d;shade=h.x;}else second=min(second,d);
  }
  float seam=1.0-smoothstep(.016,.055,second-first);
  diffuseColor.rgb*=.87+step(.33,shade)*.1+step(.72,shade)*.07;
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.58,.67,.69),seam*.48);
}`);
  };
  material.customProgramCacheKey=()=>cache()+'|landscape-rock-1';return material;
}

export function* landscapeSteps(world,{adopt,groundHeight}={}){
  const layout=world.landscape,profile=world.heightfield.landscape;
  const root=new THREE.Group();root.name='authored-landscape';adopt?.(root);
  if(!profile)return root;
  const gy=groundHeight||world.groundY,groups=new Map(),materials=new Map();
  const palettes={rock:art.rock,coast:art.coast,wall:art.masonry,root:art.roots};
  const colors=Object.fromEntries(Object.entries(palettes).map(([key,p])=>[key,[p.light,p.mid,p.shadow].map(c=>new THREE.Color(c))]));
  const bucket=(kind,x,z)=>{
    const key=kind+':'+Math.floor(x/art.cell)+':'+Math.floor(z/art.cell);
    if(!groups.has(key))groups.set(key,{kind,p:[],n:[],c:[]});
    return groups.get(key);
  };
  const addGeometry=(kind,geometry,x,z)=>{
    const flat=geometry.index?geometry.toNonIndexed():geometry;
    flat.computeVertexNormals();const p=flat.attributes.position,n=flat.attributes.normal,b=bucket(kind,x,z);
    for(let i=0;i<p.count;i++){
      const nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i),c=colors[kind][ny>.5||nx<-.5?0:nz>.2?2:1];
      b.p.push(p.getX(i),p.getY(i),p.getZ(i));b.n.push(nx,ny,nz);b.c.push(c.r,c.g,c.b);
    }
    if(flat!==geometry)flat.dispose();geometry.dispose();
  };
  // The terrain renderer already paints exposed slopes with the native rock palette.
  // Keep that single continuous surface; a second triangle skin makes the rim look cut out.
  for(const rock of layout.rocks){
    const geometry=new THREE.IcosahedronGeometry(1,1),p=geometry.attributes.position;
    // Position-dependent dents keep duplicate vertices joined. Footprint stays inside the rule circle.
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),dent=.92+Math.sin(x*9+z*7+y*4)*.06;
      p.setXYZ(i,x*rock.r*dent,Math.max(0,(y+.45)/1.45)*rock.height,z*rock.r*dent);
    }
    let base=gy(rock.x,rock.z);
    for(let i=0;i<12;i++){const a=i*Math.PI/6;base=Math.min(base,gy(rock.x+Math.cos(a)*rock.r,rock.z+Math.sin(a)*rock.r));}
    geometry.rotateY(rock.rot);geometry.translate(rock.x,base-.2,rock.z);
    const feature=layout.features.find(f=>f.id===rock.landscape);
    addGeometry(feature.kit==='coastal-rock-and-broadleaf'?'coast':'rock',geometry,rock.x,rock.z);
    yield;
  }
  for(const tree of layout.roots){
    const cfg=art.roots;
    for(let branch=0;branch<cfg.branches;branch++){
      const angle=tree.rot+branch*Math.PI*2/cfg.branches,points=[];
      for(let i=0;i<=10;i++){
        const t=i/10,d=.15+t*cfg.length,x=tree.x+Math.sin(angle+t*.18)*d,z=tree.z+Math.cos(angle+t*.18)*d;
        if(profile.clearance(x,z,.4)<.95)break;
        points.push(new THREE.Vector3(x,gy(x,z)+cfg.radius*(1-t)*.6,z));
      }
      if(points.length<3)continue;
      const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),cfg.segments,cfg.radius,cfg.sides,false),p=geometry.attributes.position;
      // Taper around each ring centre, rather than scaling the whole rooted curve.
      for(let ring=0;ring<=cfg.segments;ring++){
        const centre=new THREE.Vector3();for(let j=0;j<=cfg.sides;j++)centre.add(new THREE.Vector3().fromBufferAttribute(p,ring*(cfg.sides+1)+j));centre.divideScalar(cfg.sides+1);
        const scale=1-ring/cfg.segments*.92;
        for(let j=0;j<=cfg.sides;j++){const k=ring*(cfg.sides+1)+j;const v=new THREE.Vector3().fromBufferAttribute(p,k).sub(centre).multiplyScalar(scale).add(centre);p.setXYZ(k,v.x,v.y,v.z);}
      }
      addGeometry('root',geometry,tree.x,tree.z);
    }
    yield;
  }
  for(const wall of layout.walls){
    const cfg=art.masonry,rng=createRng(wall.seed),courses=Math.ceil(wall.height/cfg.courseHeight),cos=Math.cos(wall.angle),sin=Math.sin(wall.angle);
    for(let row=0;row<courses;row++)for(let column=0;column<cfg.columns;column++){
      if(row===courses-1&&rng.chance(.35))continue;
      const length=wall.hz*2/cfg.columns,localZ=-wall.hz+(column+.5)*length;
      const geometry=new THREE.BoxGeometry(wall.hx*2-cfg.gap,cfg.courseHeight-cfg.gap,length-cfg.gap),p=geometry.attributes.position;
      for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const chip=Math.sin(x*17+y*9+z*13+wall.seed)*cfg.chip;p.setXYZ(i,x-Math.sign(x)*Math.abs(chip),y-Math.sign(y)*Math.abs(chip),z-Math.sign(z)*Math.abs(chip));}
      geometry.rotateY(wall.angle);geometry.translate(wall.x+localZ*sin,gy(wall.x,wall.z)+(row+.5)*cfg.courseHeight,wall.z+localZ*cos);
      addGeometry('wall',geometry,wall.x,wall.z);
    }
    yield;
  }
  for(const[key,item]of groups){
    if(!materials.has(item.kind)){
      let material=patchMaterial(toon('#ffffff',{unique:true,vertexColors:true}),{see:true});
      material=item.kind==='rock'||item.kind==='coast'?rockPaint(material):paintSurface(material,item.kind==='wall'?'masonry':'bark');
      materials.set(item.kind,material);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(item.p,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(item.n,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(item.c,3));geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,materials.get(item.kind));mesh.name='landscape:'+key;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);yield;
  }
  return root;
}
