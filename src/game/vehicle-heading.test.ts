import assert from "node:assert/strict";
import { test } from "node:test";
import {
  smoothTrafficHeadingOffset,
  trafficHeadingOffset,
  trafficWorldYaw,
  wrapHeading,
} from "./vehicle-heading.ts";

const closeAngle = (actual: number, expected: number, message: string) => {
  assert.ok(Math.abs(wrapHeading(actual - expected)) < 1e-9, `${message}: ${actual} != ${expected}`);
};

test("same-direction traffic points along the route in both cardinal directions", () => {
  for (const routeYaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    closeAngle(
      trafficWorldYaw({ routeYaw, direction: 1, laneVelocity: 0, speed: 8 }),
      routeYaw,
      `forward traffic at route yaw ${routeYaw}`,
    );
  }
});

test("oncoming traffic faces opposite the route tangent", () => {
  for (const routeYaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    closeAngle(
      trafficWorldYaw({ routeYaw, direction: -1, laneVelocity: 0, speed: 8 }),
      routeYaw + Math.PI,
      `oncoming traffic at route yaw ${routeYaw}`,
    );
  }
});

test("lane-change yaw is relative to each direction's forward motion", () => {
  const forward = trafficHeadingOffset({ direction: 1, laneVelocity: 0.4, speed: 8 });
  const reverse = trafficHeadingOffset({ direction: -1, laneVelocity: 0.4, speed: 8 });
  assert.ok(forward < 0, "forward traffic steers into the lane change");
  assert.ok(reverse > 0, "oncoming traffic counter-steers relative to route yaw");
  closeAngle(
    trafficWorldYaw({ routeYaw: 0.7, direction: -1, laneVelocity: 0, speed: 8 }),
    0.7 + Math.PI,
    "reverse traffic adds the route reversal exactly once",
  );
});

test("heading smoothing uses shortest-angle interpolation and clamps long frame steps", () => {
  const start = Math.PI - 0.04;
  const target = -Math.PI + 0.04;
  const next = smoothTrafficHeadingOffset(start, target, 1, 7);
  assert.ok(Math.abs(wrapHeading(next - start)) < 0.081, "interpolates across the ±π seam");
  closeAngle(smoothTrafficHeadingOffset(0, 1, 1, 7), 1, "blend is clamped to one");
});
