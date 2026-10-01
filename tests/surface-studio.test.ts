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
      shoulderCamera: false,
      tetherReel: false,
      sampleKit: false,
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
      shoulderCamera: false,
      tetherReel: false,
      sampleKit: false,
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

test("VECTOR persistence removes accessories that its open garment cannot display", () => {
  const normalized = normalizeStudioConfiguration({
    ...DEFAULT_STUDIO_CONFIGURATION,
    conceptId: "vector",
    mission: "earth",
    accessories: {
      catEars: true,
      staff: true,
      assist: true,
      dust: true,
      haptics: true,
      shoulderCamera: true,
      tetherReel: true,
      sampleKit: true,
    },
  });
  assert.deepEqual(normalized.accessories, {
    catEars: false,
    staff: true,
    assist: true,
    dust: false,
    haptics: true,
    shoulderCamera: true,
    tetherReel: false,
    sampleKit: false,
  });
  assert.equal(normalized.mode, "assembly");
  assert.equal(normalized.helmetAttached, false);
});

test("an obsidian EVA exterior keeps its thermal conflict in shade", () => {
  const result = evaluateStudioConfiguration({
    ...DEFAULT_STUDIO_CONFIGURATION,
    paletteId: "obsidian",
    mission: "moon",
    lighting: "shade",
  });
  assert.equal(result.status, "conceptual-combination");
  assert.match(result.conflicts.join(" "), /thermal assessment.*shaded operation/i);
});

test("invalid saved data falls back without throwing", () => {
  assert.deepEqual(decodeStudioConfiguration("{oops"), DEFAULT_STUDIO_CONFIGURATION);
});

test("invalid tailoring and mission selections are normalized safely", () => {
  const normalized = normalizeStudioConfiguration({
    ...DEFAULT_STUDIO_CONFIGURATION,
    torsoStyle: "magic-cape",
    bootStyle: "magnetic-lunar",
    mission: "unknown-world",
    bodyPreset: "giant",
  });
  assert.equal(normalized.torsoStyle, DEFAULT_STUDIO_CONFIGURATION.torsoStyle);
  assert.equal(normalized.bootStyle, DEFAULT_STUDIO_CONFIGURATION.bootStyle);
  assert.equal(normalized.mission, DEFAULT_STUDIO_CONFIGURATION.mission);
  assert.equal(normalized.bodyPreset, DEFAULT_STUDIO_CONFIGURATION.bodyPreset);
});

test("older saved configurations acquire new accessory defaults without crashing", () => {
  const legacy = JSON.stringify({
    ...DEFAULT_STUDIO_CONFIGURATION,
    accessories: {
      catEars: true,
      staff: false,
      assist: false,
      dust: false,
      haptics: true,
    },
  });
  const decoded = decodeStudioConfiguration(legacy);
  assert.equal(decoded.accessories.catEars, true);
  assert.equal(decoded.accessories.shoulderCamera, false);
  assert.equal(decoded.accessories.tetherReel, true);
  assert.equal(decoded.accessories.sampleKit, true);
});

test("new powered and passive accessories contribute only their stated assumptions", () => {
  const result = evaluateStudioConfiguration({
    ...DEFAULT_STUDIO_CONFIGURATION,
    accessoryBatteryWh: 200,
    accessories: {
      catEars: false,
      staff: false,
      assist: false,
      dust: false,
      haptics: false,
      shoulderCamera: true,
      tetherReel: true,
      sampleKit: true,
    },
  });
  assert.equal(result.accessoryPowerW, 14);
  assert.ok(Math.abs(result.equipmentMassKg - (87 + 0.9 + 1.2 + 2.4)) < 1e-10);
  assert.ok(result.accessoryRuntimeH !== null);
  assert.ok(Math.abs(result.accessoryRuntimeH! - (200 * 0.85) / 14) < 1e-10);
});
