// Logical suite ownership stays stable; execution partitions retain every case.
export const OPENING_CASES = [
  { view: 'desktop', width: 1280, height: 800, touch: false, kits: ['sword', 'bow', 'staff'] },
  { view: 'ipad', width: 1180, height: 820, touch: true, kits: ['sword', 'bow', 'staff'] },
  { view: 'phone-landscape', width: 844, height: 390, touch: true, kits: ['staff'] },
  { view: 'phone-portrait', width: 390, height: 844, touch: true, kits: ['staff'] },
];

export function openingSelection(environment = {}) {
  const view = environment.OPENING_VIEW, kit = environment.KIT;
  const migration = environment.OPENING_MIGRATION || 'all';
  if (!['all', 'case', 'only'].includes(migration) ||
      (view && !OPENING_CASES.some(c => c.view === view)) ||
      (kit && !['sword', 'bow', 'staff'].includes(kit)) ||
      (migration === 'only' && (view || kit))) throw Error('Invalid opening case selection');
  const cases = migration === 'only' ? [] : OPENING_CASES.flatMap(c =>
    c.kits.filter(k => (!view || c.view === view) && (!kit || k === kit)).map(k => ({ ...c, kit: k })));
  if (migration !== 'only' && !cases.length) throw Error('Opening selection has no existing case');
  return { cases, migration: migration !== 'case' };
}

export function browserShards(suite) {
  if (suite !== 'opening') return [{ shard: suite, env: {} }];
  return [
    ...openingSelection({ OPENING_MIGRATION: 'case' }).cases.map(c => ({
      shard: `opening-${c.view}-${c.kit}`,
      env: { OPENING_VIEW: c.view, KIT: c.kit, OPENING_MIGRATION: 'case' },
    })),
    { shard: 'opening-v10-migration', env: { OPENING_MIGRATION: 'only' } },
  ];
}

export function browserShard(suite, shard = suite) {
  const selected = browserShards(suite).find(candidate => candidate.shard === shard);
  if (!selected) throw Error(`Unknown selected browser shard: ${suite}/${shard}`);
  return selected;
}
