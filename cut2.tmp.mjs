import {loadData} from './src/core/data-node.js';
import {createWorld} from './src/core/world.js';
const data=loadData();const map=data.world,w=createWorld(map),g=(x,z)=>w.terrainY(x,z);
for(const c of w.heightfield.acceptedConnectors){let worst=0,at=null,len=0;
 for(let i=1;i<c.points.length;i++){const [ax,az]=c.points[i-1],[bx,bz]=c.points[i],L=Math.hypot(bx-ax,bz-az),nx=-(bz-az)/L,nz=(bx-ax)/L;
  for(let t=0;t<1;t+=1/L){const x=ax+(bx-ax)*t,z=az+(bz-az)*t,o=c.width/2+2.5,h=g(x,z),l=g(x+nx*o,z+nz*o),r=g(x-nx*o,z-nz*o),trench=Math.min(l,r)-h;
   if(trench>.6)len++;if(trench>worst){worst=trench;at=[x.toFixed(0),z.toFixed(0)];}}}
 console.log(c.id.padEnd(26),'trench depth',worst.toFixed(2),'at',at,'trench length',len+'m');}
