// Narrow only identified equipment functions. Paths alone never certify shared code.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

export const EQUIPMENT_SUITES = ['boot', 'smoke', 'combat', 'equipment', 'equipment-focus', 'equipment-inactive', 'items', 'menu', 'save', 'workspaces', 'wearable', 'hud'];
export const EQUIPMENT_PATHS = ['src/core/character.js', 'src/core/crafting.js', 'src/ui/progressionview.js',
  'src/ui/panels.js', 'src/ui/inventory.js', 'src/ui/loadout-workspace.js', 'src/ui/loadout-workspace.css', 'src/ui/art.css'];
const functions = {
  'src/core/character.js': new Set(['gearItem', 'gearStats', 'weaponImplicit', 'handsOf', 'gearPower', 'gearRequirements',
    'wornSlot', 'wearRequirements', 'gearEquipState', 'handBlocker', 'enforceEquipment', 'equip', 'unequip', 'gearLook',
    'inactiveEquipment', 'equipmentNotice']),
  'src/core/crafting.js': new Set(['upgradeGear', 'promoteGear']),
  'src/ui/progressionview.js': new Set(['wearRequirements', 'wearRequirementRange', 'gearUpgradeTrack']),
};
const clean = node => JSON.parse(JSON.stringify(node, (key, value) => ['start', 'end', 'raw'].includes(key) ? undefined : value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const calls = node => JSON.stringify(node).match(/"name":"(?:enforceEquipment|equipmentNotice)"/);
function equipmentMigrationStatement(node) {
  // Only the notice/repair block can move independently of save migration.
  if (node.type === 'VariableDeclaration') return node.declarations.every(d =>
    ['moved', 'notice'].includes(d.id.name) && d.init?.type === 'CallExpression' &&
    ['enforceEquipment', 'equipmentNotice'].includes(d.init.callee.name) &&
    equal(d.init.arguments.map(a => a.name), ['ch', 'data']));
  if (node.type === 'ExpressionStatement') return node.expression.type === 'CallExpression' && calls(node) &&
    node.expression.callee.name === 'enforceEquipment' && equal(node.expression.arguments.map(a => a.name), ['ch', 'data']);
  // Identify the exact equipment notice writes, including the old named-item message.
  if (node.type !== 'IfStatement') return false;
  const code = JSON.stringify(node);
  if (!code.includes('"name":"equipmentNotice"') || !/"name":"(?:moved|notice)"/.test(code)) return false;
  const writes = [];
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'AssignmentExpression' || (n.type === 'UnaryExpression' && n.operator === 'delete')) writes.push(n.left || n.argument);
    for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(walk); else walk(v);
  };
  walk(node);
  return writes.length > 0 && writes.every(n => n.type === 'MemberExpression' && n.property.name === 'equipmentNotice' &&
    n.object?.type === 'MemberExpression' && n.object.object.name === 'ch' && n.object.property.name === 'progress') &&
    // No new calls/side effects may hide behind a notice write.
    !code.includes('"type":"UpdateExpression"') && !code.includes('"type":"NewExpression"') &&
    (() => { const found = []; const visit = n => { if (!n || typeof n !== 'object') return;
      if (n.type === 'CallExpression') found.push(n.callee.type === 'Identifier' ? n.callee.name : n.callee.property?.name);
      Object.values(n).forEach(v => Array.isArray(v) ? v.forEach(visit) : visit(v)); }; visit(node);
      return found.every(name => ['map', 'join', 'gearItem'].includes(name)); })();
}

function normalized(file, source) {
  const { parse } = createRequire(import.meta.url)('acorn');
  const ast = clean(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }));
  for (const top of ast.body) {
    const node = top.type === 'ExportNamedDeclaration' ? top.declaration : top;
    if (!node) continue;
    if (node.type === 'ImportDeclaration' && node.source.value.endsWith('/character.js')) {
      node.specifiers = node.specifiers.filter(s => !['inactiveEquipment', 'equipmentNotice'].includes(s.imported?.name) ||
        s.local.name !== s.imported.name);
    }
    if (node.type === 'FunctionDeclaration' && functions[file]?.has(node.id.name)) {
      // Omit recognized declarations entirely so new equipment helpers are routable.
      top.equipmentOnly = true;
    }
    if (file === 'src/core/character.js' && node.type === 'FunctionDeclaration' && node.id.name === 'migrateCharacter')
      node.body.body = node.body.body.filter(n => !equipmentMigrationStatement(n));
    if (file === 'src/ui/panels.js' && node.type === 'ClassDeclaration' && node.id.name === 'Panels') {
      node.body.body = node.body.body.filter(m => !['gearLine', 'render_bag'].includes(m.key.name));
      // Shared event dispatch remains checked outside these three equipment actions.
      const walk = n => { if (!n || typeof n !== 'object') return;
        if (n.type === 'SwitchStatement') n.cases = n.cases.filter(c => !['respec-stats', 'gear-up', 'gear-grade'].includes(c.test?.value));
        Object.values(n).forEach(v => Array.isArray(v) ? v.forEach(walk) : walk(v)); };
      walk(node);
    }
  }
  ast.body = ast.body.filter(n => !n.equipmentOnly);
  return ast;
}

export function equipmentImpact(file, before, after) {
  if (typeof before !== 'string' || typeof after !== 'string' || !before || !after) return null;
  if (['src/ui/inventory.js', 'src/ui/loadout-workspace.js', 'src/ui/loadout-workspace.css'].includes(file))
    return EQUIPMENT_SUITES; // Their equipment AND skill/mod workspace consumers are retained.
  if (file === 'src/ui/art.css') {
    // Shared art may narrow only for appended inactive-equipment rules.
    const suffix = after.startsWith(before) ? after.slice(before.length).replace(/\/\*[\s\S]*?\*\//g, '').trim() : '';
    return suffix && suffix.split('}').filter(s => s.trim()).every(rule =>
      rule.split('{').length === 2 && rule.split('{')[0].split(',').every(selector => selector.includes('.equipment-inactive') ||
        selector.trim() === '.equipment-slot .inactive-badge'))
      ? EQUIPMENT_SUITES : null;
  }
  if (!functions[file] && file !== 'src/ui/panels.js') return null;
  try { return equal(normalized(file, before), normalized(file, after)) ? EQUIPMENT_SUITES : null; }
  catch { return null; } // Missing/invalid syntax is never a narrow pass.
}

export function gitEquipmentImpacts(files, base, head) {
  const impacts = {};
  for (const file of files) {
    if (!EQUIPMENT_PATHS.includes(file)) continue;
    try {
      const read = ref => execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const suites = equipmentImpact(file, read(base), read(head));
      if (suites) impacts[file] = suites;
    } catch {} // Additions/deletions/absent history cannot use a bounded declaration.
  }
  return impacts;
}
