# Presence responsive placement review

Source base: `907190ea253e18e2df688ee137094302173d121c`. This focused change edits
only `src/ui/presence.css` in production. Exact tested CSS SHA-256:
`642028ed68558dd105ca61419f4d5059b8826ef6b0231cf95f487a3347a05095`. Screenshots and the focused harness ship with this change.

The existing touch player frame ends at x=308 on the 1024×768 viewport, while the
old drawer started at x=300. The drawer now starts at x=328 with a 20px gap and
sits below the fullscreen button. The landscape summary fits between the player
column and fullscreen button; its expanded form sits below the ammo shortcut.
The drawer has viewport/safe-inset height bounds and a sticky 44px toggle.
No global HUD, accepted main UI, game rules, networking or saves were changed.

## Focused results

Command: `CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/presence-layout.mjs`.
PASS at 1024×768 and 760×430 using real Game/Hud/Input/Supplies/Panels/Presence
classes and production stylesheet order. The 3D renderer is omitted and the
network start is stubbed. All assets/fonts are local; external requests are
blocked and the report records zero attempted external requests. No Render access.

The checks establish closed-drawer separation from player/quest HUD, Supplies,
joystick area, menu/map and fullscreen controls; open-drawer separation from the
player frame, both Supplies shortcuts and fullscreen button; in-viewport bounds
and center hit tests for the toggle/Join/Solo; room hotkey isolation; real Supplies
arrow/potion navigation and reachable native panel Close. Native close resets input.
Keyboard and CDP touch joystick inputs move the real core player after closing.
These are UI/core-input assertions, not synchronized movement or rendered-world proof.

| Viewport | Closed drawer (x, y, w, h) | Open drawer | Player frame | Panel Close |
| --- | --- | --- | --- | --- |
| 1024×768 | 328, 64, 173.91, 46 | 328, 64, 300, 243 | 22, 22, 286, 112.39 | 901.55, 86.48, 44, 44 |
| 760×430 | 246, 4, 100, 48 | 244, 132, 300, 212 | 12, 10, 222, 93 | 687, 19, 44, 44 |

Both Join/Solo buttons and the native drawer toggle are at least 44px tall;
both Supplies-panel Close buttons are 44×44 and pass center hit testing. Full
HUD/Supplies/control rectangles and measured displacement are in
[results.json](reviews/presence-responsive/results.json).

Production `npm run build` PASS (existing large-chunk warning). No broad suites,
two-client startup loops, CI polling or cloud operations were performed.

## Screenshot inspection

Observable criteria: clear player/quest/Supplies controls, readable room text,
unclipped Join/Solo and reachable close controls at both requested sizes.
Inspected all six exact PNGs separately from test assertions. The drawer and its
controls are legible and clear of the stated HUD targets; both Close buttons are
visible. The landscape expanded drawer occupies the empty area beside the quest
column and below ammo. Input is intentionally blocked while the drawer is open;
the actual joystick circle remains visible. No major defect in these sampled views.
The flat scene and blank portrait are deliberate renderer omissions, not game art.

| Artifact | SHA-256 |
| --- | --- |
| [tablet-closed.png](reviews/presence-responsive/tablet-closed.png) | `19cac48f566d4b4319372ec9a7576d528451c491eb2c7e5a8a126026c40f651d` |
| [tablet-open.png](reviews/presence-responsive/tablet-open.png) | `befbc57cbfce2536a7ff5d3987506ebcb16dd5a5b48dd8ca2bd364833186b24c` |
| [tablet-supplies-close.png](reviews/presence-responsive/tablet-supplies-close.png) | `bd362d20c9ee8bc67e37e8e4bfa4db7e37921ee3957129ce6632dee2bc0b81ad` |
| [landscape-closed.png](reviews/presence-responsive/landscape-closed.png) | `36079d7f9f8decc7c0005d2e0fe5f5756dc4e34a55e278924dfcd2e4be36496d` |
| [landscape-open.png](reviews/presence-responsive/landscape-open.png) | `cfaf8a5515fa42035b151b2094a5b91e3c34cfea459762a84b972e9e08c03d11` |
| [landscape-supplies-close.png](reviews/presence-responsive/landscape-supplies-close.png) | `19c3f88353fec6e7c6becbc84d18244ee628f61089aecc87c1a96a8166c9896e` |

Review method: static screenshots and measured real UI/core input. No continuous
animation playback, physical iPad or WebKit execution is claimed.

## Separate remaining limits

This result resolves the reproduced drawer/player-frame layout overlap. Previous
software-browser touch-world construction timeouts remain unresolved and were not
retried here. Hosted access remains restricted (`net::ERR_BLOCKED_BY_CLIENT`); the
matching-head server deployment reported by the parent does not establish hosted
two-client operation. Pending CI is parent-tracked. PR #115 stays draft; no frontend
deployment or merge. The focused CSS change does not modify the server runtime.
