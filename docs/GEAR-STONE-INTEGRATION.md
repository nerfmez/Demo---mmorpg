# Gear and upgrade material integration

Base main f7271df (PR62). Six gear from 19cda11; upgrade material commits applied in order 8fa9588, dcf1be8, 7d05d35. The final rules are 3% enhancement stone and 2% skill crystal, one each, independent rolls with existing material-find. Unenhanced salvage produces neither. Enhanced salvage returns floor(total stone investment * 0.5); old enhanced items retain the documented current-cost valuation. Existing recipe costs, upgrade effects/caps/gold and old save inventory remain intact.

Conflicts resolved additively: 84 gear, 24 materials, 5 arrows = 113 item PNGs; 17 existing skill PNGs makes 130 registered assets. All 122 prior PNG bytes unchanged. Future authored SVG fallback remains supported. Ground loot now accepts registered PNG-only art through hasArt, preventing the six new gear drops from throwing before texture load. No mesh, VFX or skill tree changes.

Validation: 242 core tests passed, production build passed, focused upgrade UI passed Chromium desktop and touch/tablet. Tests cover new crafting/equip requirements, every upgrade cost/cap, insufficient resources, +0 salvage and floor-half refunds, drop probabilities and sparse old-save round trip. Integrated browser inspection includes all six recipe icons and eight new ground sprite textures. PR CI owns full desktop/iPad Chromium/WebKit smoke before merge.
