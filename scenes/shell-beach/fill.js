// Smooth paths and cliffs at the back (owner, 26 October 2026): two narrow slots read as
// raw ravines from the game camera, the stair gully between the west headland and the
// conch terrace, and the slot behind the cove right of the conch. Each is filled with a
// ramp: inside its outline the ground rises from the sand at `mouth` to `top` at `back`
// (smoothstep along z) and stays there behind; it fades out over RAMP_SOFT past the
// outline. Ground already higher (terraces, banks) is kept, so the cliff faces stand over
// a grassy slope instead of a slot. Routes ride the ramp (field() takes the higher).
// Outlines in scene units: x = (world x + 232) / 0.6, z = (world z - 83) / 0.6 at the
// game placement; heights in scene units (world y = 0.6 h - 0.44).
const RAMP_SOFT=M(.6);
const RAMPS=[
  // stair gully, world x -255..-247, beach z 76 up to z 54 at 6 m
  {pts:[[-38.3,-11.7],[-25,-11.7],[-25,-55],[-38.3,-55]],mouth:-11.7,back:-48.3,top:10.7},
  // slot behind the cove, world x -212..-203 from the cove mouth z 66 up to z 54 at 5.5 m,
  // joining the low ground north of the east headland to x -195
  {pts:[[33.3,-28.3],[48.3,-28.3],[48.3,-48.3],[61.7,-51.7],[61.7,-68.3],[33.3,-68.3]],mouth:-28.3,back:-48.3,top:9.9},
];
function rampEdge(pts,x,z){
  let inside=false,d=Infinity;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const [ax,az]=pts[j],[bx,bz]=pts[i];
    if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
    const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    d=Math.min(d,Math.hypot(ax+dx*t-x,az+dz*t-z));
  }
  return inside?-d:d;
}
function fillAt(x,z){
  let y=-Infinity;
  for(const R of RAMPS){
    const d=rampEdge(R.pts,x,z);if(d>RAMP_SOFT)continue;
    const h=R.top*smooth(R.mouth,R.back,z)*(1-smooth(0,RAMP_SOFT,d));
    y=Math.max(y,h);
  }
  return y;
}
