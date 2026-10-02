# Harbor V4 final matched measurements

Source baseline: `6ae28dd1af73df07f09040600d4ac31db8acf26e`. V4: same local baseline plus the bundled implementation patch. PR42 excluded.

Both passes: Chromium ANGLE SwiftShader, 1180 x 820, DPR 1, medium, seed 9, paused simulation, dynres=0, 60 RAF frame intervals per scene after the same 800 ms warmup. Coordinates/zoom and buffers/GPU were checked for equality. Baseline raw results were retained from the initial exact-main capture; final V4 was measured after Quay exclusion and ramp fitting. No baseline suite was repeated.

| Scene | Calls median before → after | Triangles median before → after | Triangle change | Frame interval mean before → after, ms | Frame interval p95 before → after, ms |
| --- | --- | --- | --- | --- | --- |
| fish-hall | 342 → 344 | 415,620 → 391,686 | -5.76% | 590.25 → 618.59 | 1133.30 → 950.00 |
| market-pier | 214 → 216 | 278,889 → 261,226 | -6.33% | 564.42 → 526.37 | 800.00 → 866.60 |
| harbor-street | 279 → 280 | 349,254 → 313,640 | -10.20% | 511.09 → 538.59 | 583.30 → 683.30 |

Triangles fell by 5.8–10.2% in these views; draw calls increased by 1–2. Software frame intervals varied in both directions, so this does not establish a frame-rate improvement. SwiftShader measurements are not physical iPad results or a 60 FPS claim.

| Scene | CPU render wall mean before → after, ms | CPU render wall p50 before → after, ms | CPU render wall p95 before → after, ms | CPU render wall max after, ms | Stable geometry count after |
| --- | --- | --- | --- | --- | --- |
| fish-hall | 6.08 → 7.02 | 5.00 → 5.70 | 8.20 → 10.20 | 31.60 | 256 |
| market-pier | 5.05 → 19.20 | 4.00 → 4.90 | 6.90 → 7.30 | 858.80 | 272 |
| harbor-street | 5.04 → 6.56 | 4.00 → 5.40 | 6.70 → 10.10 | 32.50 | 323 |

CPU render-call wall time excludes asynchronous GPU completion. The pier pass contains one 858.8 ms render-call outlier; it is retained in the raw data and raises its mean. Geometry counts were constant across each 60-frame sample window; counts differ across locations because new scenery/rigs become visible. This is a focused resource-stability observation, not a long-session leak certification.

Final metric pass: no non-favicon HTTP errors, console errors or page errors. All five final screenshots were visually inspected. The first screenshot capture reported a generic 404 console warning; the subsequent final pass excluded the baseline missing favicon and reported no other errors.

Native Library screenshot copies were not saved: the required bulk upload helper failed at hosted tools/list with HTTP 401. Local PNGs and this complete review bundle remain available. No direct substitute upload or retry of that failed screenshot batch was performed.
