// One painted picture of the whole map (zone colours, hill shading, cliffs, water, roads and
// landmarks), made once from the same world data the 3D view uses. The minimap and the world
// map panel both draw from it.
import { fromBoxLocal, pointInPolygon } from '../core/math.js';

const PX = 3; // canvas pixels per metre (the map is large; keeps the image near 1300 px wide)

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const ROCK = hex('#aea58a');
const ROAD = hex('#eee0b2');
const SHALLOW = hex('#a4d7c7');
const DEEP = hex('#5eacb1');
const SAND = hex('#e9dbad');
const PLAZA = hex('#d9cfb8');

let cached = null;

/** @returns {{canvas: HTMLCanvasElement, px: number, minX: number, minZ: number, url: () => string}} */
export function mapImage(world) {
  if (cached && cached.world === world) return cached.image;
  const b = world.bounds;
  const W = Math.round(b.maxX - b.minX);
  const H = Math.round(b.maxZ - b.minZ);

  // 1 sample per metre, drawn smoothed at PX pixels per metre
  const small = document.createElement('canvas');
  small.width = W;
  small.height = H;
  const sg = small.getContext('2d');
  const img = sg.createImageData(W, H);
  const pal = new Map(world.zones.map((z) => [z.id, [hex(z.palette?.[0] || '#8ac25a'), hex(z.palette?.[1] || '#6a9a44')]]));
  const town = world.data.town;
  for (let j = 0; j < H; j++) {
    const z = b.minZ + j + 0.5;
    for (let i = 0; i < W; i++) {
      const x = b.minX + i + 0.5;
      const h = world.terrainY(x, z);
      const dx = world.terrainY(x + 1, z) - world.terrainY(x - 1, z);
      const dz = world.terrainY(x, z + 1) - world.terrainY(x, z - 1);
      const [light, dark] = pal.get(world.zoneAt(x, z).id);
      // patchy grass from a cheap hash so big zones do not look flat
      const n = Math.sin(x * 0.37 + Math.sin(z * 0.21) * 2) * Math.sin(z * 0.29 + x * 0.05);
      let c = mix(light, dark, 0.3 + n * 0.13);
      const slope = Math.hypot(dx, dz) / 2;
      if (slope > 0.75) c = mix(c, ROCK, Math.min(1, (slope - 0.75) * 2.5));
      if (town.surfaces?.length) {
        for (const s of town.surfaces) if (s.kind === 'paving' && pointInPolygon(s.points, x, z)) c = mix(c, PLAZA, s.strength ?? 1);
      } else if (Math.hypot(x - town.centre[0], z - town.centre[1]) < town.plazaRadius) c = PLAZA;
      if (world.data.sea) {
        const d = world.coastAt(x, z).distance;
        const beach = world.data.sea.beach || 14;
        if (world.isBeach(x, z)) c = mix(c, SAND, Math.min(1, (beach - d) / 5));
      }
      const rd = world.roadDist(x, z);
      if (rd < 0.8) c = mix(c, ROAD, Math.min(1, (0.8 - rd) / 0.9));
      // hill shade: light from the north-west (slopes facing -x/-z are lit), high ground a bit lighter
      const shade = 0.97 + Math.max(-0.14, Math.min(0.14, (dx + dz) * 0.13)) + Math.max(-0.1, Math.min(0.12, h * 0.018));
      c = [c[0] * shade, c[1] * shade, c[2] * shade];
      if (world.isWater(x, z)) {
        const depth = Math.max(0, world.waterLevel - h);
        c = mix(SHALLOW, DEEP, Math.min(1, depth / 1.6));
      }
      const k = (j * W + i) * 4;
      img.data[k] = c[0];
      img.data[k + 1] = c[1];
      img.data[k + 2] = c[2];
      img.data[k + 3] = 255;
    }
  }
  sg.putImageData(img, 0, 0);

  const canvas = document.createElement('canvas');
  canvas.width = W * PX;
  canvas.height = H * PX;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(small, 0, 0, canvas.width, canvas.height);
  const tx = (x) => (x - b.minX) * PX;
  const tz = (z) => (z - b.minZ) * PX;

  const poly = (box, fill, stroke) => {
    const pts = [
      [-box.hx, -box.hz],
      [box.hx, -box.hz],
      [box.hx, box.hz],
      [-box.hx, box.hz],
    ].map(([lx, lz]) => fromBoxLocal(box, lx, lz));
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(tx(p.x), tz(p.z)) : g.moveTo(tx(p.x), tz(p.z))));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = 1;
      g.stroke();
    }
  };
  // Cartographic symbols share the exact collision/landmark positions with the field.
  // Layered crowns, roofs, cliff contours and bridge planks replace anonymous dots.
  const shape = (pts, fill, stroke = '#48664b', width = .2) => {
    g.beginPath();
    pts.forEach(([x,z],i) => i ? g.lineTo(x,z) : g.moveTo(x,z));
    g.closePath(); g.fillStyle=fill; g.fill();
    if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}
  };
  // Broken contour hatching identifies traversable hills vs steep rock.
  g.strokeStyle='#4d664c27'; g.lineWidth=.6;
  for(let z=b.minZ+2;z<b.maxZ-2;z+=2) for(let x=b.minX+2;x<b.maxX-2;x+=2){
    if(world.isWater(x,z)||world.roadDist(x,z)<1) continue;
    const h=world.terrainY(x,z), next=world.terrainY(x+2,z);
    if(Math.floor(h/1.5)!==Math.floor(next/1.5)){
      g.beginPath();g.moveTo(tx(x),tz(z));g.lineTo(tx(x-.6),tz(z+1.6));g.stroke();
    }
  }
  for (const c of [...world.circles].sort((a,b)=>a.z-b.z)) {
    g.save();g.translate(tx(c.x),tz(c.z));g.scale(PX,PX);
    const treeType=['tree','willow','birch','pine','palm'].includes(c.type);
    if(treeType){
      const scale=(c.scale||1)*1.05;g.scale(scale,scale);
      g.fillStyle='#294f3d33';g.beginPath();g.ellipse(.4,.5,2.1,1.3,0,0,Math.PI*2);g.fill();
      if(c.type==='pine'){
        shape([[-.25,1.4],[.25,1.4],[.25,-.5],[-.25,-.5]],'#8c7950',null);
        shape([[-1.5,.8],[0,-2.2],[1.5,.8]],'#477b5b');
        shape([[-1.1,-.15],[0,-2.7],[1.1,-.15]],'#659060');
        shape([[-.7,-1.05],[0,-2.8],[.25,-1.05]],'#96ad74',null);
      } else {
        const light=c.type==='birch'?'#b8c779':c.type==='willow'?'#8eba89':'#9cb56f';
        const dark=c.type==='willow'?'#518367':'#638950';
        shape([[-1.9,.2],[-1.6,-1.3],[-.6,-1.4],[0,-2.1],[1,-1.4],[1.7,-1.4],[2,.2],[1.2,1.1],[0,.8],[-1,1.3]],dark);
        shape([[-1.6,-.1],[-1.5,-1.15],[-.5,-1.25],[0,-1.9],[1,-1.2],[.6,-.3],[-.1,0],[-.7,.5]],light,null);
        if(c.type==='willow'){g.strokeStyle='#a9c995';g.lineWidth=.15;for(const x of [-1,0,1]){g.beginPath();g.moveTo(x,-.4);g.lineTo(x,.6);g.stroke();}}
      }
    } else if(['rock','boulder'].includes(c.type)){
      const r=Math.max(.45,c.r);g.scale(r,r);
      shape([[-1,.25],[-.7,-.65],[.1,-.95],[.9,-.4],[1,.65],[-.2,.85]],'#9ea58b','#727e68',.14);
      shape([[-.7,-.65],[.1,-.95],[.9,-.4],[.2,.3],[-1,.25]],'#ced0ac',null);
      shape([[.2,.3],[.9,-.4],[1,.65],[-.2,.85]],'#8b987f',null);
    } else if(c.type==='crystal'){
      shape([[0,-1.2],[.7,-.2],[.25,1],[-.45,.9],[-.8,-.2]],'#a2b8c9','#617f8b',.15);
      shape([[0,-1.2],[.1,.8],[-.45,.9],[-.8,-.2]],'#d3dfd2',null);
    } else if(c.type.startsWith('pillar')||['ruin_block','statue','arch_pillar'].includes(c.type)){
      const r=Math.max(.7,c.r);
      shape([[-r,-r],[r,-r],[r,r],[-r,r]],'#d8d2b8','#84937e',.2);
      shape([[-r,-r],[r,-r],[r,.1],[-r,.1]],'#f0e5c5',null);
    }
    g.restore();
  }
  for(const bx of world.boxes){
    if(bx.type==='house'||bx.type==='stall'||bx.type==='tent'){
      poly(bx,bx.type==='house'?'#ba7854':bx.awningColor||'#e4d3a7','#6c694c');
      const ridge=[fromBoxLocal(bx,-bx.hx,0),fromBoxLocal(bx,bx.hx,0)];
      const corners=[fromBoxLocal(bx,-bx.hx,-bx.hz),fromBoxLocal(bx,bx.hx,-bx.hz),...ridge.slice().reverse()];
      g.beginPath();corners.forEach((p,i)=>i?g.lineTo(tx(p.x),tz(p.z)):g.moveTo(tx(p.x),tz(p.z)));g.closePath();g.fillStyle=bx.type==='house'?'#dfa379':bx.awningColor||'#f7edcc';g.fill();
      g.beginPath();g.moveTo(tx(ridge[0].x),tz(ridge[0].z));g.lineTo(tx(ridge[1].x),tz(ridge[1].z));g.lineWidth=1.2;g.strokeStyle='#735e46';g.stroke();
    } else if(bx.type==='workbench')poly(bx,'#aa8050','#695c3e');
    else if(bx.type==='ruin_wall')poly(bx,'#e1d7b6','#89977b');
    else if(bx.type==='fence')poly(bx,'#a18a55','#6c764e');
  }
  for(const br of world.bridges){
    poly(br,'#c9a575','#736548');
    g.strokeStyle='#8b7952';g.lineWidth=1;
    for(let x=-br.hx+1;x<br.hx;x+=1.5){
      const a=fromBoxLocal(br,x,-br.hz),c=fromBoxLocal(br,x,br.hz);
      g.beginPath();g.moveTo(tx(a.x),tz(a.z));g.lineTo(tx(c.x),tz(c.z));g.stroke();
    }
  }
  // Short water strokes communicate current without obscuring river crossings.
  g.strokeStyle='#def0d877';g.lineWidth=.9;
  for(let z=b.minZ+3;z<b.maxZ;z+=7)for(let x=b.minX+3;x<b.maxX;x+=8){
    if(!world.isWater(x,z)||world.bridgeAt(x,z))continue;
    g.beginPath();g.moveTo(tx(x-.7),tz(z));g.quadraticCurveTo(tx(x),tz(z+.3),tx(x+1),tz(z));g.stroke();
  }

  cached = {
    world,
    image: {
      canvas,
      px: PX,
      minX: b.minX,
      minZ: b.minZ,
      width: W,
      height: H,
      url() {
        if (!this._url) this._url = canvas.toDataURL('image/png');
        return this._url;
      },
    },
  };
  return cached.image;
}
