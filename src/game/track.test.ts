import assert from "node:assert/strict";
import { test } from "node:test";
import { LANE_W, MEDIAN_HALF, laneDividerLats, laneLat, medianEdgeLats } from "./track.ts";

test("four lanes form two carriageways with a non-overlapping center median", () => {
  const centers = [0, 1, 2, 3].map(laneLat);
  assert.ok(centers[0] < centers[1] && centers[1] < 0);
  assert.ok(centers[2] > 0 && centers[2] < centers[3]);
  assert.ok(centers[2] - centers[1] > LANE_W, "inner lanes include the median gap");
  assert.equal(centers[1] - centers[0], LANE_W);
  assert.equal(centers[3] - centers[2], LANE_W);
  assert.deepEqual(medianEdgeLats(), [-MEDIAN_HALF, MEDIAN_HALF]);
});

test("lane dividers are centered within each two-lane carriageway", () => {
  const [negativeDivider, positiveDivider] = laneDividerLats();
  assert.equal(negativeDivider, (laneLat(0) + laneLat(1)) / 2);
  assert.equal(positiveDivider, (laneLat(2) + laneLat(3)) / 2);
});
