// Prevent a registered legacy test from falsely certifying WebKit with Chromium.
export function validateEngineOwnership(script, contents) {
  if (script === 'equipment-inactive.mjs' &&
      (!/const\s+engine\s*=\s*process\.env\.BROWSER\s*===?\s*['"]webkit['"]\s*\?\s*webkit\s*:\s*chromium/.test(contents) ||
       !/engine\.launch\(/.test(contents) || /(?:chromium|webkit)\.launch\(/.test(contents)))
    throw Error('equipment-inactive.mjs requires BROWSER-driven Chromium and WebKit support');
}
