// Smooth path at the back (owner, 26 October 2026): the stair gully between the west
// headland and the conch terrace read as a raw ravine from the game camera. It is filled
// with a ramp (the slot behind the cove is closed by the game's west headland instead,
// data acceptedScenes.edgeCliffs): inside its outline the ground rises from the sand at `mouth` to `top` at `back`
// (smoothstep along z) and stays there behind; it fades out over RAMP_SOFT past the
// outline. Ground already higher (terraces, banks) is kept, so the cliff faces stand over
// a grassy slope instead of a slot. Routes ride the ramp (field() takes the higher).
// Outlines in scene units: x = (world x + 232) / 0.6, z = (world z - 83) / 0.6 at the
// game placement; heights in scene units (world y = 0.6 h - 0.44).
const RAMP_SOFT=M(1.6);
const RAMPS=[
  // stair gully, world x -255..-247, beach z 76 up to z 54 at 6 m
  {pts:[[-38.3,-11.7],[-25,-11.7],[-25,-55],[-38.3,-55]],mouth:-11.7,back:-48.3,top:10.7},
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
// The ramp is a grassy slope (owner, 26 October 2026: the bare dirt wedge read as an
// unnatural road): it counts as raised ground, so the trail paint (1 - top) skips it.
function fillTop(x,z){
  let w=0;
  for(const R of RAMPS){const d=rampEdge(R.pts,x,z);if(d<RAMP_SOFT)w=Math.max(w,(1-smooth(-RAMP_SOFT,RAMP_SOFT,d))*smooth(R.mouth,R.mouth+(R.back-R.mouth)*.35,z));}
  return w;
}
