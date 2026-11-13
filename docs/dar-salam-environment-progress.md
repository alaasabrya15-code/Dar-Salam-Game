# Dar El Salam-inspired road layout implementation note

The track lane coordinates now reserve a centered median corridor: lane IDs 0/1 and 2/3 remain the existing two opposing two-lane carriageways, with the original spacing retained between the two lanes in each carriageway. `laneDividerLats()` and `medianEdgeLats()` expose the appropriate marking and separator coordinates for the renderer. Existing `ROAD_HALF`, route samples, lane IDs, speed logic, and collision formulas remain unchanged.

This is the simulation/layout foundation only. The current renderer in `engine.ts` still draws the original paired yellow center stripes and does not yet build a raised concrete median or update the lane-dash placement to use `laneDividerLats()`. No physical separator has been added in this change, and no collision barrier is claimed. The next visual step must wire the exported coordinates into `buildRoad`, render the raised median with instanced geometry, and validate roadside obstacle/collision clearance.

The buildings, shop fronts, pedestrian models, and tuk-tuk rear markings are unchanged in this step. No claim is made that they have been visually upgraded.

Pure tests for lane centers, two-lane carriageway spacing, and median gap were added in `src/game/track.test.ts`. Run with the repository's Node TypeScript test configuration when a local runner is available. Tests were not executed as part of this source-only GitHub edit.
