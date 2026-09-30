import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STUDIO_CONFIGURATION,
  decodeStudioConfiguration,
  encodeStudioConfiguration,
  evaluateStudioConfiguration,
  normalizeStudioConfiguration,
} from "../lib/surface-studio/rules.ts";

test("configuration JSON round-trips through the validated persistence format", () => {
  const configured = normalizeStudioConfiguration({
    ...DEFAULT_STUDIO_CONFIGURATION,
    paletteId: "champagne",
    pantsStyle: "field",
    accessories: { ...DEFAULT_STUDIO_CONFIGURATION.accessories, catEars: true },
  });
  assert.deepEqual(decodeStudioConfiguration(encodeStudioConfiguration(configured)), configured);
});

test("mission mode keeps the helmet attached", () => {
  const config = normalizeStudioConfiguration({
    ...DEFAULT_STUDIO_CONFIGURATION,
    mode: "mission",
    helmetAttached: false,
  });
  assert.equal(config.helmetAttached, true);
});

test("detached helmet is identified as a missing EVA requirement", () => {
  const result = evaluateStudioConfiguration({
    ...DEFAULT_STUDIO_CONFIGURATION,
    mode: "assembly",
    helmetAttached: false,
  });
  assert.equal(result.status, "unresolved-conflicts");
  assert.match(result.missingRequirements.join(" "), /helmet/i);
});

test("mass and lunar weight use stated assumptions and gravity", () => {
  const config = {
    ...DEFAULT_STUDIO_CONFIGURATION,
    accessories: {
      catEars: false,
      staff: false,
      assist: false,
      dust: false,
      haptics: false,
    },
  };
  const result = evaluateStudioConfiguration(config);
  assert.equal(result.astronautMassKg, 75);
  assert.equal(result.equipmentMassKg, 87);
  assert.equal(result.combinedMassKg, 162);
  assert.equal(result.gravityMps2, 1.62);
  assert.ok(Math.abs(result.weightN - 262.44) < 1e-10);
});

test("accessory runtime excludes life support and applies assumed usable energy", () => {
  const result = evaluateStudioConfiguration({
    ...DEFAULT_STUDIO_CONFIGURATION,
    accessoryBatteryWh: 100,
    accessories: {
      catEars: false,
      staff: true,
      assist: false,
      dust: false,
      haptics: false,
    },
  });
  assert.equal(result.accessoryPowerW, 4);
  assert.ok(result.accessoryRuntimeH !== null);
  assert.ok(Math.abs(result.accessoryRuntimeH! - 21.25) < 1e-10);
});

test("VECTOR cannot be described as lunar EVA equipment", () => {
  const result = evaluateStudioConfiguration({
    ...DEFAULT_STUDIO_CONFIGURATION,
    conceptId: "vector",
    mission: "moon",
  });
  assert.equal(result.status, "unresolved-conflicts");
  assert.match(result.missingRequirements.join(" "), /life-support/i);
});

test("invalid saved data falls back without throwing", () => {
  assert.deepEqual(decodeStudioConfiguration("{oops"), DEFAULT_STUDIO_CONFIGURATION);
});
