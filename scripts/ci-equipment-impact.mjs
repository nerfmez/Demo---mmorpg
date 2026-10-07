// Narrow only identified equipment functions. Paths alone never certify shared code.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

// Equipped-state changes also feed exact weapon IDs, geometry and async model
// attachment. The two weapon scripts remain owners of that dependency.
export const EQUIPMENT_SUITES = ['boot', 'smoke', 'combat', 'equipment', 'equipment-focus', 'equipment-inactive', 'weapons', 'items', 'menu', 'save', 'workspaces', 'wearable', 'hud'];
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
const identifier = (node, name) => node?.type === 'Identifier' && node.name === name;
const property = (node, object, name) => node?.type === 'MemberExpression' && !node.computed && !node.optional &&
  identifier(node.object, object) && identifier(node.property, name);
const noticeTarget = node => node?.type === 'MemberExpression' && !node.computed && !node.optional &&
  property(node.object, 'ch', 'progress') && identifier(node.property, 'equipmentNotice');

function noticeValue(node) {
  // A finite expression grammar: no nested statements, writes, arbitrary calls,
  // callbacks with block bodies, or constructs that can exit/suspend migration.
  if (!node) return false;
  if (node.type === 'Identifier') return ['ch', 'data', 'moved', 'notice', 'it'].includes(node.name);
  if (node.type === 'Literal') return typeof node.value === 'string';
  if (node.type === 'BinaryExpression') return node.operator === '+' && noticeValue(node.left) && noticeValue(node.right);
  if (node.type === 'TemplateLiteral') return node.expressions.every(noticeValue);
  if (node.type === 'MemberExpression') return !node.optional && noticeValue(node.object) &&
    (node.computed ? noticeValue(node.property) : node.property.type === 'Identifier');
  if (node.type !== 'CallExpression' || node.optional) return false;
  if (identifier(node.callee, 'gearItem')) return node.arguments.length === 2 &&
    identifier(node.arguments[0], 'ch') && property(node.arguments[1], 'it', 'uid');
  if (property(node.callee, 'moved', 'map')) {
    const callback = node.arguments[0];
    return node.arguments.length === 1 && callback?.type === 'ArrowFunctionExpression' && !callback.async &&
      callback.expression && callback.params.length === 1 && identifier(callback.params[0], 'it') && noticeValue(callback.body);
  }
  return node.callee.type === 'MemberExpression' && !node.callee.computed && !node.callee.optional &&
    identifier(node.callee.property, 'join') && node.callee.object.type === 'CallExpression' &&
    property(node.callee.object.callee, 'moved', 'map') && noticeValue(node.callee.object) &&
    node.arguments.length === 1 && node.arguments[0].type === 'Literal' && typeof node.arguments[0].value === 'string';
}

function noticeBranch(node, deleting = false) {
  if (node?.type === 'BlockStatement') return node.body.length === 1 && noticeBranch(node.body[0], deleting);
  if (node?.type !== 'ExpressionStatement') return false;
  const expression = node.expression;
  return deleting
    ? expression.type === 'UnaryExpression' && expression.operator === 'delete' && noticeTarget(expression.argument)
    : expression.type === 'AssignmentExpression' && expression.operator === '=' && noticeTarget(expression.left) && noticeValue(expression.right);
}

function equipmentMigrationStatement(node) {
  // Only the notice/repair content can change independently of save migration.
  if (node.type === 'VariableDeclaration') return node.kind === 'const' && node.declarations.length === 1 && node.declarations.every(d =>
    ['moved', 'notice'].includes(d.id.name) && d.init?.type === 'CallExpression' && !d.init.optional &&
    identifier(d.init.callee, d.id.name === 'moved' ? 'enforceEquipment' : 'equipmentNotice') &&
    equal(d.init.arguments.map(a => a.name), ['ch', 'data']));
  if (node.type === 'ExpressionStatement') return node.expression.type === 'CallExpression' && !node.expression.optional &&
    identifier(node.expression.callee, 'enforceEquipment') && equal(node.expression.arguments.map(a => a.name), ['ch', 'data']);
  // Only these two complete if/else shapes may be normalized. Return/throw,
  // loops, nested conditionals, labels and other statements remain in the AST.
  return node.type === 'IfStatement' && (identifier(node.test, 'notice') || property(node.test, 'moved', 'length')) &&
    noticeBranch(node.consequent) && (!node.alternate || noticeBranch(node.alternate, true));
}

function normalizedMigration(body) {
  const result = [];
  for (const statement of body) {
    if (equipmentMigrationStatement(statement)) {
      // Preserve the block's position relative to all other migration work.
      if (result.at(-1)?.type !== 'EquipmentNoticeBlock') result.push({ type: 'EquipmentNoticeBlock' });
    } else result.push(statement);
  }
  return result;
}

const EQUIPMENT_ART_SELECTORS = new Set(['.equipment-slot.equipment-inactive', '.equipment-slot .inactive-badge']);
function scopedEquipmentArt(suffix) {
  // Exact complete selectors form a structural boundary. Substring matches can
  // select unrelated UI through :not(), :has(), attributes or combinators.
  const rules = suffix.matchAll(/([^{}]+)\{([^{}]*)\}/g);
  let end = 0, count = 0;
  for (const rule of rules) {
    if (suffix.slice(end, rule.index).trim() || !rule[1].split(',').every(selector =>
      EQUIPMENT_ART_SELECTORS.has(selector.trim().replace(/\s+/g, ' ')))) return false;
    end = rule.index + rule[0].length;
    count++;
  }
  return count > 0 && !suffix.slice(end).trim();
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
      node.body.body = normalizedMigration(node.body.body);
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
    return suffix && scopedEquipmentArt(suffix) ? EQUIPMENT_SUITES : null;
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
