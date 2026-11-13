/**
 * Pure traffic-heading math shared by engine QA and unit tests.
 *
 * The route tangent yaw points along local -Z. `direction` is +1 with the
 * route and -1 against it. `laneVelocity` is measured in lane units/second.
 * The returned yaw is the vehicle body's world yaw, including its lane-change
 * crab angle, but excluding model-local fit corrections (which belong in the
 * fitted instance wrapper).
 */
export type TrafficDirection = 1 | -1;

export type TrafficHeadingInput = {
  routeYaw: number;
  direction: TrafficDirection;
  laneVelocity: number;
  speed: number;
  laneWidth?: number;
};

export function wrapHeading(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function trafficHeadingOffset({
  direction,
  laneVelocity,
  speed,
  laneWidth = 3.45,
}: Omit<TrafficHeadingInput, "routeYaw">) {
  const forwardSpeed = Math.max(1.15, Math.abs(speed));
  return Math.atan2(-direction * laneVelocity * laneWidth, forwardSpeed);
}

export function trafficWorldYaw(input: TrafficHeadingInput) {
  const routeReverse = input.direction < 0 ? Math.PI : 0;
  return input.routeYaw + routeReverse + trafficHeadingOffset(input);
}

/**
 * Advance a smoothed lane-change heading toward its desired offset. This is
 * kept separate from route yaw so the reverse-traffic π turn is applied once.
 */
export function smoothTrafficHeadingOffset(current: number, desired: number, dt: number, response = 7) {
  const blend = Math.min(1, Math.max(0, dt * response));
  return current + wrapHeading(desired - current) * blend;
}
