import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const assetUrl = new URL("../public/models/rieva-aeris-x.glb", import.meta.url);

function readGlbJson(buffer) {
  assert.equal(buffer.toString("utf8", 0, 4), "glTF", "asset has a GLB header");
  assert.equal(buffer.readUInt32LE(4), 2, "asset uses glTF 2.0");
  assert.equal(buffer.readUInt32LE(8), buffer.length, "declared GLB length matches");
  const jsonLength = buffer.readUInt32LE(12);
  assert.equal(buffer.toString("utf8", 16, 20), "JSON", "first chunk is JSON");
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength).trim());
}

test("AERIS-X contains authored aircraft systems and module metadata", async () => {
  const buffer = await readFile(assetUrl);
  assert.ok(buffer.length > 120_000, "asset contains substantial authored geometry");
  assert.ok(buffer.length < 2_000_000, "asset remains browser-friendly");

  const gltf = readGlbJson(buffer);
  assert.ok((gltf.meshes ?? []).length >= 120, "R2 airframe retains close-up detail meshes");
  const names = new Set((gltf.nodes ?? []).map((node) => node.name));
  for (const name of [
    "AERIS_X_ROOT",
    "PART_FUSELAGE",
    "PART_CANOPY",
    "PART_WING_L",
    "PART_WING_R",
    "PART_INTAKE_L",
    "PART_INTAKE_R",
    "PART_ENGINE_CORE_L",
    "PART_ENGINE_CORE_R",
    "PART_NOZZLE_L",
    "PART_NOZZLE_R",
    "BLENDED_CENTERBODY_L",
    "BLENDED_CENTERBODY_R",
    "CANOPY_ARCH_MID",
    "INTAKE_COMPRESSION_RAMP_L",
    "INTAKE_COMPRESSION_RAMP_R",
    "FAN_SPINNER_L",
    "FAN_SPINNER_R",
    "NOZZLE_INTERIOR_L",
    "NOZZLE_INTERIOR_R",
    "GEAR_BAY_INSET_NOSE",
  ]) {
    assert.ok(names.has(name), `${name} is present`);
  }

  const moduleNodes = (gltf.nodes ?? []).filter(
    (node) => node.name?.startsWith("MODULE_") && node.extras?.module_id,
  );
  const moduleIds = new Set(moduleNodes.map((node) => node.extras.module_id));
  for (const moduleId of [
    "multispectral-sensor",
    "radiation-liner",
    "sensor-shutters",
    "biofiltration-intake",
    "first-contact-array",
    "thermal-management",
    "observer-buoy",
    "field-sensor",
    "em-hardening",
    "redundant-controls",
  ]) {
    assert.ok(moduleIds.has(moduleId), `${moduleId} is configurable`);
  }
  assert.ok(
    moduleNodes.every((node) => typeof node.extras.mass_kg === "number"),
    "each module publishes its assumed mass",
  );
  assert.ok(
    moduleNodes.every((node) => typeof node.extras.evidence_tier === "string"),
    "each module publishes its evidence tier",
  );

  const root = (gltf.nodes ?? []).find((node) => node.name === "AERIS_X_ROOT");
  assert.equal(root?.extras?.no_weapons, true, "asset is explicitly unarmed");
  assert.match(root?.extras?.coordinate_contract ?? "", /-Z nose-forward/);
  assert.match(root?.extras?.reference_url ?? "", /nasa\.gov/);
  assert.match(root?.extras?.geometry_revision ?? "", /R2/);
});

test("Three.js loads AERIS-X parts and extras without losing interaction data", async () => {
  const buffer = await readFile(assetUrl);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, "", resolve, reject);
  });

  const named = new Map();
  const selectable = [];
  const modules = [];
  gltf.scene.traverse((object) => {
    named.set(object.name, object);
    if (object.userData.part_id) selectable.push(object);
    if (object.userData.module_id) modules.push(object);
  });
  assert.ok(named.has("AERIS_X_ROOT"), "root survives browser parsing");
  assert.ok(selectable.length >= 28, "clickable parts survive browser parsing");
  assert.ok(modules.length >= 10, "module metadata survives browser parsing");
  assert.ok(named.has("EM_AVIONICS_CAGE_SHIELD"), "internal EM cage is loadable");
  assert.ok(named.has("REDUNDANT_CONTROL_TRUNK_A"), "first control path is loadable");
  assert.ok(named.has("REDUNDANT_CONTROL_TRUNK_B"), "second control path is loadable");
  assert.ok(named.has("ANCHOR_EXHAUST_L"), "effect anchors survive browser parsing");
  assert.ok(named.has("ANCHOR_EXHAUST_R"), "both propulsion anchors survive parsing");
});
