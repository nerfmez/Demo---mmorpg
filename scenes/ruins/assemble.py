# Builds ruins/src.html from the beach page's reusable blocks plus ruins/scene.js
import re
import os
S = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
b = open(S + 'beach/src.html').read().split('\n')
def block(start, end):
    i = next(k for k, l in enumerate(b) if l.startswith(start))
    j = next(k for k, l in enumerate(b) if k > i and l.startswith(end))
    return '\n'.join(b[i:j])
style = block('<style>', '<div id="stage">').replace('</style>', '').replace('<style>', '')
style = style.replace("background: #9fd6e8;", "background: #5f8f43;")
# a gentler sun glow: the concept's light comes through the canopy, not a washed-out corner
style = style.replace("rgba(255, 238, 196, .3), rgba(255, 238, 196, .08) 45%", "rgba(255, 238, 196, .12), rgba(255, 238, 196, .04) 45%")
style = style.replace("rgba(255, 246, 214, .07) 70px 120px", "rgba(255, 246, 214, .045) 70px 120px")
assert '.12), rgba' in style
# the ruins' mood: warm golden afternoon light over everything, a stronger glow from the top left
style = style.replace("rgba(255, 238, 196, .12), rgba(255, 238, 196, .04) 45%", "rgba(255, 228, 170, .26), rgba(255, 228, 170, .08) 45%")
style += "  #warm { background: linear-gradient(170deg, rgba(255, 196, 110, .16), rgba(255, 214, 140, .06) 55%, rgba(120, 90, 40, .08)); mix-blend-mode: soft-light; }\n"

head = '<title>ทางเข้าซากปรักหักพัง</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>' + style.split('\n', 1)[1] + '</style>\n'
markup = '''<div id="stage">
  <canvas id="c" aria-label="ฉาก 3D ทางเข้าซากปรักหักพัง"></canvas>
  <div class="atmo" id="sunwash"></div>
  <div class="atmo" id="rays"></div>
  <div class="atmo" id="warm"></div>
  <div class="atmo" id="vignette"></div>
  <img id="ref" alt="ภาพคอนเซปต์ทางเข้าซากปรักหักพัง" src="%%REF%%">
  <div id="divider"></div>
  <span class="tag" id="tag3d">3D</span>
  <span class="tag" id="tagref">ภาพอ้างอิง</span>
</div>
<div class="bar">
  <label for="wipe">เลื่อนเพื่อเทียบ</label>
  <input id="wipe" type="range" min="0" max="100" value="100" step="0.5">
  <div class="seg">
    <button id="only3d" type="button">3D อย่างเดียว</button>
    <button id="half" type="button">ครึ่งครึ่ง</button>
    <button id="onlyref" type="button">ภาพอ้างอิง</button>
  </div>
  <span id="status">กำลังสร้างฉาก…</span>
</div>
<script type="text/plain" id="hero-glb">%%HERO%%</script>
'''
importmap = block('<script type="importmap">', '<script type="module">') + '\n'
imports = block('<script type="module">', '// ---------- page:')
page = block('// ---------- page:', '// ---------- world layout')
renderer = block('// ---------- renderer', '// ---------- shared GLSL')
renderer = renderer.replace("scene.background = new THREE.Color('#9fd8e4');", "scene.background = new THREE.Color('#5f8f43');")
# the camera and the shadow box follow the scene's scale K (the concept's view is K = 1)
K = float(re.search(r"const K = ([\d.]+);", open(S + 'ruins/scene.js').read()).group(1))
f = lambda v: f"{v * K:g}"
renderer = re.sub(r"const CAM = \{[^}]*\};", f"const CAM = {{ target: new V3(0, 0, -{f(3)}), pitch: 40, dist: {f(30)}, yaw: 0 }};", renderer)
renderer = renderer.replace("// fitted so the shoreline, the track mouth, the waypoint and the wreck land where the reference has them", "// the concept's view: 40 degrees down, close enough that the hero is about 85 px tall in the 941 px frame")
renderer = renderer.replace("sun.position.copy(SUN).multiplyScalar(90);\nscene.add(sun, sun.target);", f"sun.target.position.set(0, 0, -{f(9)}); sun.position.copy(SUN).multiplyScalar(90).add(sun.target.position);\nscene.add(sun, sun.target);")
renderer = renderer.replace("Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 40, bottom: -40, near: 10, far: 220 });", f"Object.assign(sun.shadow.camera, {{ left: -{f(30)}, right: {f(30)}, top: {f(32)}, bottom: -{f(32)}, near: 10, far: {f(145)} }});")
# the shadow box grows with K, so its texels do too: push the bias with it (no acne stripes)
renderer = renderer.replace("sun.shadow.normalBias = 0.04;", f"sun.shadow.normalBias = {0.04 * K:g};")
assert f'dist: {f(30)}' in renderer and 'add(sun.target.position)' in renderer and f'left: -{f(30)}' in renderer
glsl = block('// ---------- shared GLSL', '// ---------- ground:')
under = re.search(r"\n  // under the sea:.*?\n  \}\n", glsl, re.S)
assert under, 'underwater block'
glsl = glsl.replace(under.group(0), '\n')
stones = block('// ---------- faceted grey stones', '// ---------- foliage from the game')
foliage = block('// ---------- foliage from the game', '// ---------- the stone ledges')
glow = block('function glowTexture()', '// ---------- shipwreck')
hero = block('// ---------- the hero:', '// ---------- the waypoint:')
blocked = re.search(r"function blocked\(x, z\) \{.*?\n\}\n", hero, re.S)
assert blocked
hero = hero.replace(blocked.group(0), '''function blocked(x, z) {
  if (x < GX0 + 3 || x > GX1 - 3 || z < -26 * K || z > 6.5 * K) return true;
  // ledges: too steep to walk (the stairs are fine)
  const y = height(x, z), g = Math.max(Math.abs(height(x + 0.3, z) - y), Math.abs(height(x, z + 0.3) - y)) / 0.3;
  if (g > 1.1 && !stairsAt(x, z).inside) return true;
  return COLLIDERS.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 0.3);
}
''')
scene = open(S + 'ruins/scene.js').read()
scene = scene.replace("const COLLIDERS = [];\n", "")
scene = scene.replace("function build() {\n  scene.add(buildGround());", "function build() {\n  { const [x, z] = P(0.5, 0.905); HERO.x = x; HERO.z = z; HERO.face = Math.PI - 0.25; }\n  scene.add(buildGround());")
foliage = foliage.replace("const root = new THREE.Color('#4f8f2f'), tip = new THREE.Color('#d2e865')", "const root = new THREE.Color('#47702f'), tip = new THREE.Color('#bcc94a')")
assert '#bcc94a' in foliage
js = '\n'.join([imports, page, renderer, glsl, stones, foliage, glow, hero, scene])
out = head + markup + importmap + js + '\n</script>\n'
open(S + 'ruins/src.html', 'w').write(out)
print('src.html', len(out))
