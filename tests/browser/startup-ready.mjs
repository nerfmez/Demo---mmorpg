// Standalone predicates: Playwright serializes each function into the page.
// Simulation can advance after static construction while imports/loader remain.
export function initialUiReady() {
  const f = window.__frontier, region = f?.view?.region;
  return !!(f?.game?.time > .5 && f.modelsReady && region?.staticReady &&
    !region.disposed && region.importedState === 'imported-ready' &&
    document.getElementById('loading')?.classList.contains('done'));
}

export function vrmHeroReady() {
  const f = window.__frontier, hero = f?.view?.hero, body = hero?.skin?.body;
  // hero_base also supplies setFace. Named VRM bones establish the rebuilt body;
  // the separate hair-review rig can share those names and is not this fixture.
  return !!(f?.modelsReady && document.getElementById('loading')?.classList.contains('done') &&
    typeof hero?.setFace === 'function' && hero.hairsample !== true &&
    body?.getObjectByName('J_Bip_C_Head') && body.getObjectByName('J_Bip_C_Hips'));
}
