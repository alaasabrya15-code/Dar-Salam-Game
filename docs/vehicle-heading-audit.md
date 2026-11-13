# Vehicle heading and model orientation audit

## Coordinate convention

`track.ts` derives yaw along the route. Vehicle movement and the follow camera use the local forward vector `(-sin(yaw), 0, -cos(yaw))`. Traffic traveling with the route uses its tangent; opposing traffic uses the tangent plus π. Lane changes add a small relative yaw. These route/traffic/collision rules are intended to remain unchanged.

`fitProp` supports per-instance `forward`, `yawOffset`, and `longAxis` settings. Corrections live on a wrapper group, not the shared GLTF source/cache. `root.userData.vehicleOrientation` records the selected source direction, offset, applied long-axis decision, and corrected local-forward vector. `src/game/vehicle-heading.ts` now contains pure, unit-testable traffic direction and lane-change heading math for both traffic directions.

## Model-by-model registration inventory

The entries below reflect the existing `engine.ts` `trafficUrls` options translated from the legacy `nose` flag (`true` => source forward `positive-z`; `false` => `negative-z`). The GitHub file tools expose GLB metadata/size, but do not render or decode the mesh geometry. Therefore none of the source hood directions can be independently verified from the binary in this editing session. Existing flags have not been flipped without evidence.

| Asset | Class | Existing direction setting | Long axis | Result / required validation |
| --- | --- | --- | --- | --- |
| `low_poly_autorickshaw_aka_tuktuk.glb` | Player + traffic tuk-tuk | `positive-z` (`nose: true`) | Auto | Existing wrapper correction points normalized forward to local −Z; visually unverified |
| `2005_toyota_hiace.glb` | Microbus | `negative-z` (`nose: false`) | Auto | Legacy alignment preserved; visually unverified |
| `2018_toyota_hiace_version_2.glb` | Microbus | `negative-z` (`nose: false`) | Auto | Legacy alignment preserved; visually unverified |
| `toyota_corolla.glb` | Taxi | `positive-z` (`nose: true`) | Auto | Existing wrapper correction points normalized forward to local −Z; visually unverified |
| `toyota_corola.glb` | Taxi | `negative-z` (`nose: false`) | Auto | Legacy alignment preserved; visually unverified |
| `toyota_caisor.glb` | Taxi | `negative-z` (`nose: false`) | Auto | Legacy alignment preserved; visually unverified |
| `2013_mitsubishi_lancer_es5.glb` | Private car | `negative-z` (`nose: false`) | Auto | Legacy alignment preserved; visually unverified |
| `toyota_corolla_egypt_2004.glb` | Private car | `positive-z` (`nose: true`) | Auto | Existing wrapper correction points normalized forward to local −Z; visually unverified |
| `2014_nissan_ddsen.glb` | Private car | `negative-z` (`nose: false`) | Auto | Legacy alignment preserved; visually unverified |
| `toyota_hilux.glb` | Truck | `negative-z` (`nose: false`) | Auto | Legacy alignment preserved; visually unverified |
| `ud_quon.glb` | Truck | `negative-z` (`nose: false`) | Auto | Legacy alignment preserved; visually unverified |
| `thaco_auman.glb` | Truck | `negative-z` (`nose: false`) | Auto | Legacy alignment preserved; visually unverified |

## Engine integration status

`engine.ts` now uses the shared heading helpers to calculate and smooth lane-change yaw relative to each vehicle's actual travel direction. The reverse-route π turn is applied once, and the existing lane selection, speeds, positions, collision spacing, and per-model `nose` corrections remain unchanged. The model orientations still require visual validation; no GLB direction flags were changed without evidence.

## Automated and visual checks

The focused pure-math tests verify route-forward and opposing heading calculations, lane-change signs, and angular smoothing. They passed after the helper was integrated into the engine. A browser/device visual traffic test was not available in this environment, so model-facing direction remains visually unverified.

Before marking any GLB visually corrected, inspect front headlights/grille and rear lamps/plate, then confirm on a straight and curved segment:

1. With route direction `+1`, the hood points along the track tangent.
2. With direction `-1`, the hood points against the tangent. The asset correction remains constant; only route yaw changes by π.
3. On curves and lane changes, body yaw follows the sampled tangent plus its lane-change offset.
4. Collision spacing, lanes, and speeds remain unchanged.
5. A second model in the same class remains unaffected, proving that no shared cached GLTF was mutated.

No model is claimed as visually passed in this session.
