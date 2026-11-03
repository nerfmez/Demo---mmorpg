import * as THREE from 'three';
import FX from '../../data/combat-fx.json';
// Reveal the existing animated companion; never substitute the static preview wolf.
export function installSpiritReveal(rig){
 const cfg=FX.skills.spirit_wolf.body;
 const state={height:{value:0},base:{value:0},parts:[],top:1.8};
 // how tall the body is (unscaled): the reveal climbs all of it, a tall alpha or golem too (updateSpiritReveal's scale)
 rig.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(rig.root);if(isFinite(box.max.y))state.top=Math.max(0.6,(box.max.y-box.min.y)/(rig.root.scale.y||1));
 rig.root.traverse(o=>{
  if(!o.isMesh||!o.material)return;
  const originals=o.material;const convert=original=>{
   const m=original.clone();m.userData={...m.userData,shared:false,rig:true};
   const spiritBody=!!original.map;
   if(spiritBody){m.userData.spiritBody=true;if((cfg.alpha??1)<1){m.transparent=true;m.depthWrite=true;}}
   const prior=original.onBeforeCompile;
   m.onBeforeCompile=shader=>{
    prior?.call(original,shader);
    if(spiritBody){
     Object.assign(shader.uniforms,{uSpiritDark:{value:new THREE.Color(cfg.shadow)},uSpiritLight:{value:new THREE.Color(cfg.light)},uSpiritRim:{value:new THREE.Color(cfg.rim)},uSpiritEmission:{value:cfg.emission},uSpiritRimStrength:{value:cfg.rimStrength},uSpiritContrast:{value:cfg.contrast??1},uSpiritAlpha:{value:cfg.alpha??1},uSpiritEdgeAlpha:{value:cfg.edgeAlpha??0}});
     shader.fragmentShader='uniform vec3 uSpiritDark,uSpiritLight,uSpiritRim;uniform float uSpiritEmission,uSpiritRimStrength,uSpiritContrast,uSpiritAlpha,uSpiritEdgeAlpha;\n'+shader.fragmentShader;
     shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nvec3 spiritSrc=diffuseColor.rgb;float spiritDetail=sqrt(clamp(dot(spiritSrc,vec3(.2126,.7152,.0722)),0.,1.));spiritDetail=clamp((spiritDetail-.5)*uSpiritContrast+.5,0.,1.);diffuseColor.rgb=mix(uSpiritDark,uSpiritLight,spiritDetail)*(.85+.3*(spiritSrc-dot(spiritSrc,vec3(.333))));');
     shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','float spiritEdge=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),3.);outgoingLight+=diffuseColor.rgb*uSpiritEmission+uSpiritRim*spiritEdge*uSpiritRimStrength;diffuseColor.a*=uSpiritAlpha+uSpiritEdgeAlpha*spiritEdge; /* see-through in the middle, firmer at the edges: a ghost */\n#include <opaque_fragment>');
    }
    shader.uniforms.uSpiritHeight=state.height;shader.uniforms.uSpiritBase=state.base;
    shader.vertexShader='varying float vSpiritY;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvSpiritY=(modelMatrix*vec4(transformed,1.)).y;');
    shader.fragmentShader='varying float vSpiritY;uniform float uSpiritHeight,uSpiritBase;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat edgeNoise=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)*.08;if(vSpiritY-uSpiritBase>uSpiritHeight+edgeNoise)discard;');
   };
   m.customProgramCacheKey=()=>original.customProgramCacheKey()+'-approved-spirit-reveal-cyan-v3';return m;
  };
  o.material=Array.isArray(originals)?originals.map(convert):convert(originals);state.parts.push({o,originals,materials:Array.isArray(o.material)?o.material:[o.material]});
 });
 return state;
}
export function removeSpiritReveal(state){if(!state)return;for(const p of state.parts){for(const m of p.materials)m.dispose();p.o.material=p.originals;}state.parts.length=0;}
/** scale: the rig's scale now (its height is state.top x scale). */
export function updateSpiritReveal(state,age,life,ground,scale=1){state.base.value=ground;state.height.value=Math.min(1,age/.36,Math.max(0,life/.4))*(state.top*scale+0.3)-.08;}
