// Reveal the existing animated companion; never substitute the static preview wolf.
export function installSpiritReveal(rig){
 const state={height:{value:0},base:{value:0},parts:[]};
 rig.root.traverse(o=>{
  if(!o.isMesh||!o.material)return;
  const originals=o.material;const convert=original=>{
   const m=original.clone();m.userData={...m.userData,shared:false,rig:true};
   const prior=original.onBeforeCompile;
   m.onBeforeCompile=shader=>{
    prior?.call(original,shader);
    shader.uniforms.uSpiritHeight=state.height;shader.uniforms.uSpiritBase=state.base;
    shader.vertexShader='varying float vSpiritY;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvSpiritY=(modelMatrix*vec4(transformed,1.)).y;');
    shader.fragmentShader='varying float vSpiritY;uniform float uSpiritHeight,uSpiritBase;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat edgeNoise=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)*.08;if(vSpiritY-uSpiritBase>uSpiritHeight+edgeNoise)discard;');
   };
   m.customProgramCacheKey=()=>original.customProgramCacheKey()+'-approved-spirit-reveal';return m;
  };
  o.material=Array.isArray(originals)?originals.map(convert):convert(originals);state.parts.push({o,originals,materials:Array.isArray(o.material)?o.material:[o.material]});
 });
 return state;
}
export function removeSpiritReveal(state){if(!state)return;for(const p of state.parts){for(const m of p.materials)m.dispose();p.o.material=p.originals;}state.parts.length=0;}
export function updateSpiritReveal(state,age,life,ground){state.base.value=ground;state.height.value=Math.min(1,age/.36,Math.max(0,life/.4))*1.8-.08;}
