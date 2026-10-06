import test from 'node:test';
import assert from 'node:assert/strict';
import {initialUiReady,vrmHeroReady} from '../browser/startup-ready.mjs';

function fixture(){
  const old={window:globalThis.window,document:globalThis.document};
  const state={done:true,bones:true};
  const hero={setFace(){},skin:{body:{getObjectByName:()=>state.bones?{}:undefined}}};
  const f={game:{time:1},modelsReady:true,view:{region:{staticReady:true,importedState:'imported-ready',disposed:false},hero}};
  globalThis.window={__frontier:f};
  globalThis.document={getElementById:()=>({classList:{contains:name=>name==='done'&&state.done}})};
  return {state,f,hero,close(){for(const[key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}};
}

test('simulation time alone is false-ready while the initial UI is covered or models are loading',()=>{
  const c=fixture();
  try{
    assert.equal(initialUiReady(),true);
    c.state.done=false;assert.equal(c.f.game.time>.5,true,'the old predicate falsely passes');assert.equal(initialUiReady(),false);
    c.state.done=true;c.f.modelsReady=false;assert.equal(initialUiReady(),false);
    c.f.modelsReady=true;c.f.view.region.importedState='loading';assert.equal(initialUiReady(),false);
    c.f.view.region.importedState='imported-ready';c.f.view.region.staticReady=false;assert.equal(initialUiReady(),false);
    c.f.view.region.staticReady=true;c.f.view.region.disposed=true;assert.equal(initialUiReady(),false);
    c.f.view.region.disposed=false;c.f.game.time=.5;assert.equal(initialUiReady(),false);
    c.f.game.time=.51;assert.equal(initialUiReady(),true);
  }finally{c.close();}
});

test('setFace on the ordinary fallback or hair-review body is not VRM readiness',()=>{
  const c=fixture();
  try{
    assert.equal(vrmHeroReady(),true);
    c.state.bones=false;assert.equal(typeof c.hero.setFace,'function','the old predicate falsely passes');assert.equal(vrmHeroReady(),false);
    c.state.bones=true;
    const lookup=c.hero.skin.body.getObjectByName;
    c.hero.skin.body.getObjectByName=name=>name==='J_Bip_C_Head'?{}:undefined;assert.equal(vrmHeroReady(),false);
    c.hero.skin.body.getObjectByName=name=>name==='J_Bip_C_Hips'?{}:undefined;assert.equal(vrmHeroReady(),false);
    c.hero.skin.body.getObjectByName=lookup;c.hero.hairsample=true;assert.equal(vrmHeroReady(),false);
    c.hero.hairsample=false;c.state.done=false;assert.equal(vrmHeroReady(),false);
    c.state.done=true;c.f.modelsReady=false;assert.equal(vrmHeroReady(),false);
    c.f.modelsReady=true;assert.equal(vrmHeroReady(),true);
    delete c.hero.skin;assert.equal(vrmHeroReady(),false);
  }finally{c.close();}
});

test('predicates serialize without closure dependencies and absent boot state is false',()=>{
  const c=fixture();
  try{
    const serializedUi=Function(`return (${initialUiReady.toString()})();`);
    const serializedVrm=Function(`return (${vrmHeroReady.toString()})();`);
    assert.equal(serializedUi(),true);assert.equal(serializedVrm(),true);
    delete window.__frontier;assert.equal(serializedUi(),false);assert.equal(serializedVrm(),false);
  }finally{c.close();}
});
