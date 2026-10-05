# Held weapon runtime review — first increment

Runtime source: `47941b6` (renderer and GLB identity unchanged from these captures). Source GLB hashes and revisions: `../../WEAPON-MODEL-PROVENANCE.json`.

Inspected actual Chromium software-rendered pixels, not Blender previews: all 19 desktop equip closeups at 1180×820 (460×460 crop, zoom 0.3, facing 0.6), plus Tusk Blade/Fang Dagger dual wield and Beetle Maul/Tower Shield. Individual views and labeled six-image contact sheets were inspected. Files in this directory are a curated subset of the actual capture outputs; the complete capture suite is an Actions artifact.

Criteria: exported geometry intact; handle meets hand; complete silhouette; no detached handle/parts, giant scale or excessive body clipping; readable material colors/edges. These views pass within this sampled scope. Large authored greatblades remain visibly large. Staff/bow heads overlap the upper body in this front-oblique carry view; this is ordinary depth overlap, and alternate viewports/action phases remain under review. Source decorative spores remain present. No geometry corrections or reductions were necessary.

Current observations are still-image review, not continuous normal-speed playback or physical-device testing. iPad/mobile viewport, swing/walk/stop, save reload and resource checks are still in progress. Local WebKit is blocked by missing host libraries; CI engine results remain separate from physical iPad performance. Parent approval is required before merge/deploy.
