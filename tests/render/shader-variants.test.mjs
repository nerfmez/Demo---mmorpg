import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

// Every shader program costs a compile/link behind the loading card (~50 ms each on
// software GL). An outline width is a uniform, so hulls of any width share one program.
const jsonHook=registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{...context.importAttributes,type:'json'}}:context);}});
const {outlineMaterial}=await import('../../src/render/toon.js');
const {garmentHull}=await import('../../src/render/garments.js');
jsonHook.deregister();

const compile=m=>{const shader={uniforms:{},vertexShader:'#include <common>\nvoid main(){\n#include <begin_vertex>\nvBind = position;\n}',fragmentShader:'#include <common>\nvoid main(){\n#include <color_fragment>\n}'};m.onBeforeCompile(shader,null);return shader;};

test('outline hulls of different widths share one program; the width is a uniform',()=>{
 const a=outlineMaterial('#2a2230',.02),b=outlineMaterial('#2a2230',.042);
 assert.equal(a.customProgramCacheKey(),b.customProgramCacheKey());
 const sa=compile(a),sb=compile(b);
 assert.equal(sa.vertexShader,sb.vertexShader);
 assert.equal(sa.uniforms.outlineWidth.value,.02);assert.equal(sb.uniforms.outlineWidth.value,.042);
});

test('garment hulls of different widths and darkness share one program',()=>{
 const F=new Proxy({},{get:()=>.5}),a=garmentHull('top',F,{},.01,.32),b=garmentHull('top',F,{},.014,.4);
 assert.equal(a.customProgramCacheKey(),b.customProgramCacheKey());
 const sa=compile(a),sb=compile(b);
 assert.equal(sa.vertexShader,sb.vertexShader);assert.equal(sa.fragmentShader,sb.fragmentShader);
 assert.equal(sb.uniforms.hullWidth.value,.014);assert.equal(sb.uniforms.hullDarkness.value,.4);
});

test('accepted scenes share a paint program only when their paint shader source is the same',async()=>{
 const {readFileSync,readdirSync}=await import('node:fs');
 const dir=new URL('../../src/render/accepted-scenes/',import.meta.url),keys={};
 for(const f of readdirSync(dir).filter(f=>f.endsWith('.js')))keys[f]=readFileSync(new URL(f,dir),'utf8').match(/'paint\|([0-9a-f]{8})\|'/)[1];
 // the beach paints its underwater tint, the forest does not: one key each
 assert.notEqual(keys['beach.js'],keys['forest.js']);
 assert.ok(new Set(Object.values(keys)).size<Object.keys(keys).length,'identical shaders still share');
});
