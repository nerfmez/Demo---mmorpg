// Prevent a registered legacy test from falsely certifying WebKit with Chromium.
export function validateEngineOwnership(script, contents) {
  if (['equipment-inactive.mjs', 'monster-identity.mjs'].includes(script) &&
      (!/const\s+engine\s*=\s*process\.env\.BROWSER\s*===?\s*['"]webkit['"]\s*\?\s*webkit\s*:\s*chromium/.test(contents) ||
       !/engine\.launch\(/.test(contents) || /(?:chromium|webkit)\.launch\(/.test(contents)))
    throw Error(`${script} requires BROWSER-driven Chromium and WebKit support`);
}
