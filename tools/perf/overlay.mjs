// Exact-anchor, additive instrumentation. Applied to disposable profiling copies only.
// Refuse source drift instead of silently emitting incomplete measurements.
const header = "import { pf as __pf } from './__stream-profile.mjs';\n";
function replaceOnce(code, before, after, file) {
  const n = code.split(before).length - 1;
  if (n !== 1) throw Error(`${file}: expected one profiling anchor, found ${n}: ${before.slice(0,100)}`);
  return code.replace(before, after);
}
function wrapExport(code, file, name, kind, label, worldArg=0) {
  const declaration = kind === 'generator' ? `export function* ${name}(` : `export function ${name}(`;
  code = replaceOnce(code, declaration, declaration.replace(`export function${kind==='generator'?'*':''} ${name}`, `function${kind==='generator'?'*':''} __pf_raw_${name}`), file);
  return code + `\nexport const ${name} = __pf.${kind}(${JSON.stringify(label)}, __pf_raw_${name}${kind === 'generator' ? ', '+worldArg : ''});\n`;
}
export const TARGETS = ['src/render/ground.js','src/render/environment.js','src/render/static-batch.js',
  'src/render/grass.js','src/render/region.js','src/render/view.js','src/render/city.js',
  'src/render/town-kit.js','src/render/models.js'];
export function instrument(file, source) {
  if (!TARGETS.includes(file)) throw Error(`unsupported profiling target: ${file}`);
  if(source.includes('__stream-profile.mjs')) throw Error(`already instrumented: ${file}`);
  let code = source;
  if (file.endsWith('/ground.js')) code = wrapExport(code,file,'terrainSteps','generator','terrain.build');
  if (file.endsWith('/environment.js')) code = wrapExport(code,file,'environmentSteps','generator','environment.build');
  if (file.endsWith('/static-batch.js')) code = wrapExport(code,file,'batchStatic','sync','batchStatic');
  if (file.endsWith('/grass.js')) code = wrapExport(code,file,'bakeGrassSteps','generator','grass.bake',2);
  if (file.endsWith('/region.js')) {
    code = wrapExport(code,file,'regionSteps','generator','region.build',1);
    code = replaceOnce(code,'export function disposeRegion(region) {','export function disposeRegion(region) {\n  __pf.disposed(region);',file);
  }
  if (file.endsWith('/view.js')) {
    const line = source.split('\n').find(s => s.includes('this.renderer = new THREE.WebGLRenderer('));
    if (!line) throw Error(`${file}: missing renderer construction`);
    code = replaceOnce(code,line,line+'\n    __pf.renderer(this.renderer);',file);
    code += '\n__pf.installView(View);\n';
  }
  if (file.endsWith('/models.js')) code = replaceOnce(code,'const loader = new GLTFLoader();',"const loader = __pf.loader(new GLTFLoader(), 'templates');",file);
  if (file.endsWith('/city.js')) {
    code = replaceOnce(code,'loader = new GLTFLoader();',"loader = __pf.loader(new GLTFLoader(), 'city');\n  const __pf_pre = __pf.begin('city.preload-assembly', {world:world.data.id});",file);
    code = replaceOnce(code,'  const files = await Promise.all(',"  __pf.end(__pf_pre);\n  const files = await Promise.all(",file);
    code = replaceOnce(code,'  const originals = new Set(), materials = new Map();',"  const __pf_assembly = __pf.begin('city.postload-assembly', {world:world.data.id});\n  const originals = new Set(), materials = new Map();",file);
    code = replaceOnce(code,'  const dressing=await loadCityDressing(world,root,loader);',"  __pf.end(__pf_assembly);\n  const __pf_dressing = __pf.begin('city.dressing-wall', {world:world.data.id});\n  const dressing=await loadCityDressing(world,root,loader);\n  __pf.end(__pf_dressing);",file);
  }
  if (file.endsWith('/town-kit.js')) {
    code = replaceOnce(code,'loader = new GLTFLoader();',"loader = __pf.loader(new GLTFLoader(), 'town-kit');",file);
    code = replaceOnce(code,'  const root = new THREE.Group();',"  const __pf_assembly = __pf.begin('town-kit.postload-assembly', {world:world.data.id});\n  const root = new THREE.Group();",file);
    code = replaceOnce(code,'  const batch = batchStatic(root, { cell: 24 });',"  __pf.end(__pf_assembly);\n  const batch = batchStatic(root, { cell: 24 });",file);
  }
  return header + code;
}
