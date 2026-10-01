import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const assetUrl = new URL("../public/models/rieva-missionwear.glb", import.meta.url);

function readGlbJson(buffer) {
  assert.equal(buffer.toString("utf8", 0, 4), "glTF", "asset has a glTF binary header");
  assert.equal(buffer.readUInt32LE(4), 2, "asset uses glTF 2.0");
  assert.equal(buffer.readUInt32LE(8), buffer.length, "declared GLB length matches the file");
  const jsonLength = buffer.readUInt32LE(12);
  assert.equal(buffer.toString("utf8", 16, 20), "JSON", "first GLB chunk is JSON");
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength).trim());
}

test("Blender missionwear contains all concepts and interaction metadata", async () => {
  const buffer = await readFile(assetUrl);
  assert.ok(buffer.length > 1_000_000, "asset contains substantial authored geometry");
  assert.ok(buffer.length < 8_000_000, "asset remains practical for browser delivery");

  const gltf = readGlbJson(buffer);
  const nodes = gltf.nodes ?? [];
  const names = new Set(nodes.map((node) => node.name));
  for (const concept of ["CONCEPT_MAX", "CONCEPT_MALTE", "CONCEPT_BASTIAN"]) {
    assert.ok(names.has(concept), `${concept} root is present`);
  }

  const partNodes = nodes.filter((node) => node.extras?.part_id);
  const materialNodes = nodes.filter((node) => node.extras?.materialRole);
  const rigNodes = nodes.filter((node) => node.extras?.rig_role);
  assert.ok(partNodes.length >= 80, "named selectable equipment nodes are exported");
  assert.ok(materialNodes.length >= 200, "material-role metadata is exported");
  assert.ok(rigNodes.length >= 20, "articulation pivots are exported");

  const partIds = new Set(partNodes.map((node) => node.extras.part_id));
  for (const required of [
    "helmet-pressure-shell",
    "helmet-visor",
    "torso-shell",
    "glove-left",
    "boot-left",
    "walking-staff",
    "assistive-lower-body-module",
  ]) {
    assert.ok(partIds.has(required), `${required} remains inspectable`);
  }
});

test("Three.js GLTFLoader preserves selectable nodes and articulation pivots", async () => {
  const buffer = await readFile(assetUrl);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, "", resolve, reject);
  });

  const named = new Map();
  gltf.scene.traverse((object) => named.set(object.name, object));
  for (const name of ["CONCEPT_MAX", "CONCEPT_MALTE", "CONCEPT_BASTIAN"]) {
    assert.ok(named.has(name), `${name} survives the browser loader`);
  }

  const selectable = [];
  const articulated = [];
  gltf.scene.traverse((object) => {
    if (object.userData.part_id) selectable.push(object);
    if (object.userData.rig_role) articulated.push(object);
  });
  assert.ok(selectable.length >= 80, "selectable extras survive GLTFLoader");
  assert.ok(articulated.length >= 20, "rig extras survive GLTFLoader");
  assert.ok(
    articulated.some((node) => node.userData.rig_role === "body"),
    "body articulation node is discoverable regardless of Object3D subclass",
  );
});
