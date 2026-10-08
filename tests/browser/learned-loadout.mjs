// Explicit learned-loadout fixture for combat/menu regressions; never production grants.
export async function installLearnedLoadout(page) {
  await page.evaluate(() => {
    const g=__frontier.game;
    Object.assign(g.ch.skills,{slash:1,hunter_shot:1,firebolt:1,ward:1});
    g.ch.slots=['slash','ward','firebolt',null].map(skill=>({skill,mods:[]}));
    g.ch.movementSkills=['dash','roll'];g.ch.movement='dash';g.refresh();__frontier.input.refreshButtons();
  });
}
