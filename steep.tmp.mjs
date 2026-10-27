import {loadData} from './src/core/data-node.js';
import {createWorld} from './src/core/world.js';
import {acceptedScenes} from './src/core/accepted-scenes.js';
const d=loadData().world,w=createWorld(d),s=acceptedScenes(d).find(s=>s.id==='forest'),b=s.bounds;
const [x0,x1,z0,z1,st]=[-160,-64,-115,-40,1];
console.log('bounds',b);
for(let z=z0;z<=z1;z+=st){let r=String(z).padStart(5)+' ';for(let x=x0;x<=x1;x+=st){const sl=w.heightfield.slopeAt(x,z),inn=x>=b[0]&&x<=b[1]&&z>=b[2]&&z<=b[3];r+=sl>1.2?'#':sl>.7?'+':inn?'.':' ';}console.log(r);}
