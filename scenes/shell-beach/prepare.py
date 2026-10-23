"""Prepare the Shell Beach world from the retained scene's portable terrain blocks."""
from pathlib import Path
import re
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text()
w=r[:r.index('function PG(')]
w=w.replace('const PL = M(1.0);','const PL = M(3.6);')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES = [
  {top:M(3.6),base:0,ledge:true,soft:M(2),lean:M(.55),pts:[[-.3,.54,'b'],[.0,.57,'b'],[.10,.63,'b'],[.18,.62,'b'],[.25,.56,'b'],[.235,.49,'b'],[.19,.43,'b'],[.17,.37,'n'],[.22,.25,'n'],[.28,.14,'n'],[.2,-.3,'t'],[-.3,-.3,'t']]},
  {top:M(4.4),base:0,ledge:true,soft:M(2.5),lean:M(.6),pts:[[.30,.37,'b'],[.38,.36,'b'],[.46,.31,'b'],[.55,.31,'b'],[.65,.34,'b'],[.74,.40,'b'],[.79,.35,'b'],[.82,.27,'n'],[.77,.06,'n'],[.7,-.35,'t'],[.3,-.35,'t']]},
  {top:M(3.7),base:0,ledge:true,soft:M(2),lean:M(.65),pts:[[1.3,.88,'b'],[1.03,.82,'b'],[.95,.75,'b'],[.89,.68,'b'],[.86,.57,'b'],[.82,.49,'b'],[.83,.40,'b'],[.88,.31,'n'],[.88,.12,'n'],[1.3,-.3,'t']]},
  {top:M(5.4),base:M(2),ledge:true,soft:M(2),lean:M(.6),pts:[[.27,.18,'b'],[.37,.21,'b'],[.44,.20,'b'],[.53,.22,'b'],[.62,.20,'b'],[.66,.12,'n'],[.58,-.3,'t'],[.26,-.3,'t']]},
''' + w[b:]
a=w.index('const STAIR_ROWS =');b=w.index(';',a);w=w[:a]+'''const STAIR_ROWS = [[.46,.115,.215],[.41,.09,.19],[.36,.105,.205],[.31,.13,.23],[.25,.14,.24],[.19,.17,.27],[.13,.21,.31]]'''+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS = [
 [[.18,.51,.045,0],[.23,.45,.04,0],[.29,.41,.045,0],[.4,.39,.045,0],[.49,.43,.04,0]],
 [[.92,.20,.018,PL],[.92,.11,.018,PL],[.90,.02,.018,PL]],
 [[.21,.16,.018,PL],[.27,.09,.018,PL],[.34,.03,.018,PL]],
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a);w=w[:a]+'''const PLAZA=poly([[-.2,.53],[.15,.52],[.28,.40],[.43,.32],[.8,.35],[.91,.62],[.94,.92],[-.2,.85]],0);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
''' +w[b:]
a=w.index('  // The authored court');b=w.index('  const st = stairsAt',a);w=w[:a]+w[b:]
a=w.index('  return f.y +');b=w.index('\n}',a);w=w[:a]+'''  const sand=f.y + 0.05 * noise2(x*.6,z*.6)+.08*f.top*noise2(x*.4+7,z*.4);
  return sand-Math.min(M(2),Math.max(0,z-zShore(x))*.35);'''+w[b:]
# The shoreline is traced in screen space, as are the terraces.
a=w.index('// the shape of the land:');w=w[:a]+'''const SHORE_POINTS=[[-.2,.46],[0,.55],[.13,.65],[.27,.71],[.46,.80],[.64,.81],[.82,.85],[1.2,.87]].map(([u,v])=>P(u,v));
function zShore(x){
 for(let i=1;i<SHORE_POINTS.length;i++)if(x<SHORE_POINTS[i][0]){const a=SHORE_POINTS[i-1],b=SHORE_POINTS[i],t=Math.max(0,(x-a[0])/(b[0]-a[0]));return a[1]+(b[1]-a[1])*t+.16*Math.sin(x*.7);}
 return SHORE_POINTS.at(-1)[1]+.16*Math.sin(x*.7);
}
const SHORE_GLSL='float zShoreG(float x){'+SHORE_POINTS.slice(1).map((b,i)=>{const a=SHORE_POINTS[i];return `if(x<${b[0].toFixed(5)})return mix(${a[1].toFixed(5)},${b[1].toFixed(5)},clamp((x-(${a[0].toFixed(5)}))/${(b[0]-a[0]).toFixed(5)},0.,1.))+.16*sin(x*.7);`;}).join('')+`return ${SHORE_POINTS.at(-1)[1].toFixed(5)}+.16*sin(x*.7);}`;
''' +w[a:]
w=w.replace('concept (ruins-approach-40deg)', 'Singing Conch Coast concept')
# Sand, not forest dirt, in the new bay's painted ground.
w=w.replace("'#e0ab63'","'#e7bb75'").replace("'#efc27b'","'#f3d394'").replace("'#cc8f4c'","'#d9b475'").replace("'#f2c886'","'#f7dda2'")
# Soft beach margin on all low ground; grass belongs on raised terraces.
w=w.replace('const trail = 1 - smooth(-0.5, 0.5, d);','const trail = Math.max(1 - smooth(-0.5, 0.5, d),1-f.top);')
w=w.replace('float tr=1.-smoothstep(-.3,.3,dd);','float tr=max(1.-smoothstep(-.3,.3,dd),vColor.y);')
w=w.replace(' - f.rock * M(2.5));',' - f.rock * M(2.5) - Math.min(M(2),Math.max(0,z-zShore(x))*.35));')
# Side cliffs are much less stratified than the old ruin ridge.
w=w.replace('const row=[0,.29,.59,.83,1]','const row=[0,.24,.56,.81,1]')
(here/'world.js').write_text(w)
