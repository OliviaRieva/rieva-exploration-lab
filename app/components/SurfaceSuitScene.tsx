"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type SurfaceSuitBodyPreset = "compact" | "standard" | "tall";
export type SurfaceSuitPantsStyle = "contour" | "field" | "mobility";
export type SurfaceSuitTorsoStyle = "streamline" | "field-rig" | "adaptive";
export type SurfaceSuitBootStyle = "traverse" | "rock" | "stability";
export type SurfaceSuitMotionMode = "neutral" | "walk" | "run" | "jump";
export type SurfaceSuitConceptId = "selene" | "areo" | "vector";
export type SurfaceSuitTestMode =
  | "none"
  | "uv"
  | "dust"
  | "lighting"
  | "signal"
  | "haptic"
  | "support";

export type SurfaceSuitPartId =
  | "helmet-pressure-shell"
  | "helmet-visor"
  | "helmet-sun-visor"
  | "helmet-neck-ring"
  | "helmet-cat-ear-pods"
  | "helmet-lights"
  | "torso-shell"
  | "torso-layers"
  | "shoulder-left"
  | "shoulder-right"
  | "elbow-left"
  | "elbow-right"
  | "knee-left"
  | "knee-right"
  | "lower-body"
  | "glove-left"
  | "glove-right"
  | "wrist-ring-left"
  | "wrist-ring-right"
  | "boot-left"
  | "boot-right"
  | "dust-gaiter-left"
  | "dust-gaiter-right"
  | "backpack"
  | "walking-staff"
  | "assistive-lower-body-module"
  | "haptic-module"
  | "vector-monitoring"
  | "shoulder-camera"
  | "tether-reel"
  | "sample-kit";

export interface SurfaceSuitPalette {
  shell: string;
  secondaryShell: string;
  underlayer: string;
  accent: string;
  visor: string;
  sunVisor: string;
  metal: string;
  light: string;
  dust: string;
  assist: string;
  haptic: string;
}

export interface SurfaceSuitPaletteInput extends Partial<SurfaceSuitPalette> {
  id?: string;
  name?: string;
  base?: string;
  secondary?: string;
  dark?: string;
}

export interface SurfaceSuitSceneProps {
  conceptId?: SurfaceSuitConceptId;
  active?: boolean;
  palette?: SurfaceSuitPaletteInput;
  bodyPreset?: SurfaceSuitBodyPreset;
  selectedPartId?: string | null;
  previewOnlySelectedPart?: boolean;
  helmetAttached?: boolean;
  exploded?: boolean;
  cutaway?: boolean;
  walking?: boolean;
  motionMode?: SurfaceSuitMotionMode;
  testMode?: SurfaceSuitTestMode;
  catEars?: boolean;
  staff?: boolean;
  assistModule?: boolean;
  dustModule?: boolean;
  haptics?: boolean;
  shoulderCamera?: boolean;
  tetherReel?: boolean;
  sampleKit?: boolean;
  pantsStyle?: SurfaceSuitPantsStyle;
  torsoStyle?: SurfaceSuitTorsoStyle;
  bootStyle?: SurfaceSuitBootStyle;
  onSelectPart?: (partId: string) => void;
  className?: string;
}

export const DEFAULT_SURFACE_SUIT_PALETTE: SurfaceSuitPalette = {
  shell: "#dbe8ec",
  secondaryShell: "#9fb3bd",
  underlayer: "#101b26",
  accent: "#55d8e7",
  visor: "#173e50",
  sunVisor: "#d3933f",
  metal: "#667985",
  light: "#8cf5ff",
  dust: "#c7a275",
  assist: "#adc5ce",
  haptic: "#ffb85c",
};

export const SURFACE_SUIT_PART_LABELS: Readonly<
  Record<SurfaceSuitPartId, string>
> = {
  "helmet-pressure-shell": "Helmet pressure shell",
  "helmet-visor": "Primary visor",
  "helmet-sun-visor": "Sun visor",
  "helmet-neck-ring": "Helmet neck ring",
  "helmet-cat-ear-pods": "Cat-ear sensor pods",
  "helmet-lights": "Helmet lights",
  "torso-shell": "Torso pressure shell",
  "torso-layers": "Torso protective layers",
  "shoulder-left": "Left shoulder assembly",
  "shoulder-right": "Right shoulder assembly",
  "elbow-left": "Left elbow and forearm",
  "elbow-right": "Right elbow and forearm",
  "knee-left": "Left knee and lower leg",
  "knee-right": "Right knee and lower leg",
  "lower-body": "Lower-body pressure garment",
  "glove-left": "Left glove",
  "glove-right": "Right glove",
  "wrist-ring-left": "Left wrist ring",
  "wrist-ring-right": "Right wrist ring",
  "boot-left": "Left boot",
  "boot-right": "Right boot",
  "dust-gaiter-left": "Left dust gaiter",
  "dust-gaiter-right": "Right dust gaiter",
  backpack: "Life-support backpack",
  "walking-staff": "Walking staff",
  "assistive-lower-body-module": "Assistive lower-body module",
  "haptic-module": "Haptic feedback module",
  "vector-monitoring": "BASTIAN garment monitoring sensors",
  "shoulder-camera": "Shoulder documentation camera",
  "tether-reel": "Retractable tether reel",
  "sample-kit": "Sealed sample and tool kit",
};

export const SURFACE_SUIT_PART_ALIASES: Readonly<
  Record<SurfaceSuitPartId, string>
> = {
  "helmet-pressure-shell": "helmet-shell",
  "helmet-visor": "protective-visor",
  "helmet-sun-visor": "sun-visor",
  "helmet-neck-ring": "neck-interface",
  "helmet-cat-ear-pods": "cat-ear-pods",
  "helmet-lights": "comms-lighting",
  "torso-shell": "torso-assembly",
  "torso-layers": "thermal-outer",
  "shoulder-left": "joint-assemblies",
  "shoulder-right": "joint-assemblies",
  "elbow-left": "joint-assemblies",
  "elbow-right": "joint-assemblies",
  "knee-left": "joint-assemblies",
  "knee-right": "joint-assemblies",
  "lower-body": "joint-assemblies",
  "glove-left": "gloves",
  "glove-right": "gloves",
  "wrist-ring-left": "wrist-interfaces",
  "wrist-ring-right": "wrist-interfaces",
  "boot-left": "terrain-boots",
  "boot-right": "terrain-boots",
  "dust-gaiter-left": "dust-module",
  "dust-gaiter-right": "dust-module",
  backpack: "life-support",
  "walking-staff": "walking-staff",
  "assistive-lower-body-module": "assist-module",
  "haptic-module": "haptic-module",
  "vector-monitoring": "monitoring",
  "shoulder-camera": "shoulder-camera",
  "tether-reel": "tether-reel",
  "sample-kit": "sample-kit",
};

const INSPECTOR_SELECTION_GROUPS: Readonly<Record<string, SurfaceSuitPartId[]>> = {
  "comfort-garment": ["torso-layers", "lower-body"],
  "cooling-garment": ["torso-layers"],
  "pressure-retention": ["torso-shell", "lower-body"],
  "restraint-layer": ["torso-shell", "lower-body"],
  "crew-provisions": ["backpack"],
  monitoring: ["backpack", "helmet-lights"],
  "tool-tethers": ["lower-body", "tether-reel"],
};

function partMatchesSelection(
  internalPartId: SurfaceSuitPartId,
  selectedPartId: string | null,
) {
  if (!selectedPartId) return false;
  return (
    internalPartId === selectedPartId ||
    SURFACE_SUIT_PART_ALIASES[internalPartId] === selectedPartId ||
    INSPECTOR_SELECTION_GROUPS[selectedPartId]?.includes(internalPartId) === true
  );
}

type MaterialRole =
  | keyof SurfaceSuitPalette
  | "platform"
  | "seam"
  | "skin"
  | "hair";

interface PartTransformData {
  basePosition: THREE.Vector3;
  explodeOffset: THREE.Vector3;
}

interface SuitRig {
  root: THREE.Group;
  body: THREE.Group;
  helmetAssembly: THREE.Group;
  undercap: THREE.Object3D;
  backpack: THREE.Group;
  partGroups: Map<SurfaceSuitPartId, THREE.Object3D[]>;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  staffGroup: THREE.Group;
  testEffects: Map<Exclude<SurfaceSuitTestMode, "none">, THREE.Group>;
  selectionHalo: THREE.Box3Helper;
  authoredContainer: THREE.Group | null;
  authoredRigs: Map<SurfaceSuitConceptId, AuthoredArticulation>;
}

interface AuthoredArticulation {
  root: THREE.Object3D;
  body: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftElbow: THREE.Object3D;
  rightElbow: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftKnee: THREE.Object3D;
  rightKnee: THREE.Object3D;
  helmetAssembly: THREE.Object3D | null;
}

interface CameraOrbit {
  yaw: number;
  pitch: number;
  distance: number;
  targetY: number;
}

const BODY_SCALES: Record<SurfaceSuitBodyPreset, THREE.Vector3> = {
  compact: new THREE.Vector3(1.06, 0.92, 1.04),
  standard: new THREE.Vector3(1, 1, 1),
  tall: new THREE.Vector3(0.96, 1.1, 0.98),
};

const BODY_BASE_Y: Record<SurfaceSuitBodyPreset, number> = {
  compact: -0.38,
  standard: -0.23,
  tall: -0.04,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function vector(
  x = 0,
  y = 0,
  z = 0,
) {
  return new THREE.Vector3(x, y, z);
}

function euler(
  x = 0,
  y = 0,
  z = 0,
) {
  return new THREE.Euler(x, y, z);
}

function colorForRole(role: MaterialRole, palette: SurfaceSuitPalette) {
  if (role === "platform") return "#d8ddea";
  if (role === "seam") return palette.underlayer;
  if (role === "skin") return "#a66f57";
  if (role === "hair") return "#2c2024";
  return palette[role];
}

function createMaterial(role: MaterialRole, palette: SurfaceSuitPalette) {
  const color = colorForRole(role, palette);
  if (role === "visor" || role === "sunVisor") {
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: role === "visor" ? 0.13 : 0.2,
      metalness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: role === "visor" ? 0.58 : 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness:
      role === "underlayer" || role === "seam" || role === "skin" || role === "hair"
        ? 0.72
        : role === "metal" || role === "assist"
          ? 0.32
          : 0.48,
    metalness:
      role === "metal" || role === "assist"
        ? 0.66
        : role === "light"
          ? 0.22
          : 0.08,
  });
  if (role === "light") {
    material.emissive.set(color);
    material.emissiveIntensity = 2.2;
  }
  if (role === "haptic") {
    material.emissive.set(color);
    material.emissiveIntensity = 0.28;
  }
  return material;
}

function makePart(
  parent: THREE.Object3D,
  registry: Map<SurfaceSuitPartId, THREE.Object3D[]>,
  id: SurfaceSuitPartId,
  name: string,
  position = vector(),
  explodeOffset = vector(),
) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.partId = id;
  group.position.copy(position);
  const transformData: PartTransformData = {
    basePosition: position.clone(),
    explodeOffset: explodeOffset.clone(),
  };
  group.userData.partTransform = transformData;
  parent.add(group);
  const groups = registry.get(id) ?? [];
  groups.push(group);
  registry.set(id, groups);
  return group;
}

interface MeshOptions {
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
  scale?: THREE.Vector3;
  cutawaySurface?: boolean;
  pantsStyle?: SurfaceSuitPantsStyle;
  torsoStyle?: SurfaceSuitTorsoStyle;
  bootStyle?: SurfaceSuitBootStyle;
  castShadow?: boolean;
}

function addMesh(
  parent: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  role: MaterialRole,
  options: MeshOptions = {},
) {
  const mesh = new THREE.Mesh(
    geometry,
    createMaterial(role, DEFAULT_SURFACE_SUIT_PALETTE),
  );
  mesh.name = name;
  mesh.userData.materialRole = role;
  mesh.userData.cutawaySurface = options.cutawaySurface ?? false;
  if (options.pantsStyle) mesh.userData.pantsStyle = options.pantsStyle;
  if (options.torsoStyle) mesh.userData.torsoStyle = options.torsoStyle;
  if (options.bootStyle) mesh.userData.bootStyle = options.bootStyle;
  if (options.position) mesh.position.copy(options.position);
  if (options.rotation) mesh.rotation.copy(options.rotation);
  if (options.scale) mesh.scale.copy(options.scale);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeConceptGroup(
  parent: THREE.Object3D,
  conceptId: SurfaceSuitConceptId,
  name: string,
) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.conceptVariant = conceptId;
  parent.add(group);
  return group;
}

function addTorus(
  parent: THREE.Object3D,
  name: string,
  radius: number,
  tube: number,
  role: MaterialRole,
  position = vector(),
  rotation = euler(),
  scale = vector(1, 1, 1),
  arc = Math.PI * 2,
) {
  return addMesh(
    parent,
    name,
    new THREE.TorusGeometry(radius, tube, 10, 42, arc),
    role,
    { position, rotation, scale },
  );
}

function addCapsule(
  parent: THREE.Object3D,
  name: string,
  radius: number,
  length: number,
  role: MaterialRole,
  position = vector(),
  scale = vector(1, 1, 1),
  rotation = euler(),
  options: Omit<MeshOptions, "position" | "scale" | "rotation"> = {},
) {
  return addMesh(
    parent,
    name,
    new THREE.CapsuleGeometry(radius, length, 8, 20),
    role,
    { ...options, position, scale, rotation },
  );
}

function addCylinder(
  parent: THREE.Object3D,
  name: string,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  role: MaterialRole,
  position = vector(),
  rotation = euler(),
  scale = vector(1, 1, 1),
  options: Omit<MeshOptions, "position" | "scale" | "rotation"> = {},
) {
  return addMesh(
    parent,
    name,
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 24, 3),
    role,
    { ...options, position, rotation, scale },
  );
}

function tailoredPanelGeometry(
  points: Array<[number, number]>,
  depth = 0.055,
) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.025,
    bevelThickness: 0.018,
    curveSegments: 8,
  });
  geometry.center();
  return geometry;
}

function anatomicalTorsoGeometry() {
  return new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.36, -0.7),
      new THREE.Vector2(0.48, -0.52),
      new THREE.Vector2(0.52, -0.18),
      new THREE.Vector2(0.59, 0.18),
      new THREE.Vector2(0.66, 0.42),
      new THREE.Vector2(0.52, 0.67),
      new THREE.Vector2(0.31, 0.75),
    ],
    48,
  );
}

function buildArm(
  body: THREE.Group,
  registry: Map<SurfaceSuitPartId, THREE.Object3D[]>,
  side: -1 | 1,
) {
  const sideName = side < 0 ? "left" : "right";
  const shoulderId = `shoulder-${sideName}` as SurfaceSuitPartId;
  const elbowId = `elbow-${sideName}` as SurfaceSuitPartId;
  const wristId = `wrist-ring-${sideName}` as SurfaceSuitPartId;
  const gloveId = `glove-${sideName}` as SurfaceSuitPartId;
  const shoulder = makePart(
    body,
    registry,
    shoulderId,
    `${sideName} shoulder assembly`,
    vector(side * 0.73, 1.17, 0),
    vector(side * 0.46, 0.12, 0.05),
  );
  shoulder.rotation.z = side * 0.09;
  addMesh(
    shoulder,
    `${sideName} rounded shoulder cap`,
    new THREE.SphereGeometry(0.27, 28, 18),
    "secondaryShell",
    {
      scale: vector(1.12, 0.92, 1),
      cutawaySurface: true,
    },
  );
  addCapsule(
    shoulder,
    `${sideName} upper-arm pressure layer`,
    0.19,
    0.47,
    "underlayer",
    vector(0, -0.38, 0),
    vector(0.92, 1, 0.95),
  );
  addCapsule(
    shoulder,
    `${sideName} upper-arm outer sleeve`,
    0.205,
    0.4,
    "shell",
    vector(0, -0.36, 0),
    vector(1, 0.82, 1),
    euler(),
    { cutawaySurface: true },
  );
  addTorus(
    shoulder,
    `${sideName} upper-arm seam`,
    0.19,
    0.026,
    "seam",
    vector(0, -0.58, 0),
    euler(Math.PI / 2),
  );

  const elbow = makePart(
    shoulder,
    registry,
    elbowId,
    `${sideName} elbow and forearm assembly`,
    vector(0, -0.74, 0),
    vector(side * 0.24, -0.08, 0.08),
  );
  addMesh(
    elbow,
    `${sideName} elbow bearing`,
    new THREE.SphereGeometry(0.21, 24, 16),
    "metal",
    { scale: vector(1, 0.78, 1) },
  );
  addTorus(
    elbow,
    `${sideName} elbow joint ring`,
    0.175,
    0.038,
    "accent",
    vector(),
    euler(Math.PI / 2),
  );
  addCapsule(
    elbow,
    `${sideName} forearm underlayer`,
    0.16,
    0.47,
    "underlayer",
    vector(0, -0.38, 0),
    vector(0.96, 1, 0.96),
  );
  addCylinder(
    elbow,
    `${sideName} tapered forearm shell`,
    0.155,
    0.195,
    0.53,
    "shell",
    vector(0, -0.37, 0),
    euler(),
    vector(1, 1, 1),
    { cutawaySurface: true },
  );

  const wrist = makePart(
    elbow,
    registry,
    wristId,
    `${sideName} wrist bearing ring`,
    vector(0, -0.69, 0),
    vector(side * 0.14, -0.08, 0.04),
  );
  addTorus(
    wrist,
    `${sideName} wrist metal ring`,
    0.145,
    0.042,
    "metal",
    vector(),
    euler(Math.PI / 2),
  );
  addTorus(
    wrist,
    `${sideName} wrist accent seal`,
    0.132,
    0.018,
    "accent",
    vector(0, -0.045, 0),
    euler(Math.PI / 2),
  );

  const glove = makePart(
    wrist,
    registry,
    gloveId,
    `${sideName} articulated glove`,
    vector(0, -0.18, 0),
    vector(side * 0.1, -0.12, 0.05),
  );
  addCapsule(
    glove,
    `${sideName} glove palm`,
    0.135,
    0.13,
    "secondaryShell",
    vector(0, -0.05, 0.015),
    vector(1.04, 1, 0.75),
  );
  for (let finger = 0; finger < 4; finger += 1) {
    addCapsule(
      glove,
      `${sideName} glove finger ${finger + 1}`,
      0.032,
      0.11,
      "shell",
      vector((finger - 1.5) * 0.052, -0.19 - Math.abs(finger - 1.5) * 0.008, 0.035),
      vector(0.82, 0.92 + (finger === 1 || finger === 2 ? 0.1 : 0), 0.82),
    );
  }
  addCapsule(
    glove,
    `${sideName} glove thumb`,
    0.038,
    0.09,
    "shell",
    vector(side * 0.13, -0.11, 0.025),
    vector(0.9, 1, 0.9),
    euler(0, 0, side * -0.55),
  );

  return { shoulder, elbow, glove };
}

function addPantsStyleGeometry(
  leg: THREE.Group,
  sideName: "left" | "right",
) {
  addCapsule(
    leg,
    `${sideName} classic trouser shell`,
    0.235,
    0.55,
    "shell",
    vector(0, -0.43, 0),
    vector(1.02, 1, 1),
    euler(),
    { cutawaySurface: true, pantsStyle: "contour" },
  );

  const segmented = new THREE.Group();
  segmented.name = `${sideName} segmented trouser panels`;
  segmented.userData.pantsStyle = "mobility";
  leg.add(segmented);
  for (let panel = 0; panel < 3; panel += 1) {
    addCylinder(
      segmented,
      `${sideName} segmented thigh panel ${panel + 1}`,
      0.22 - panel * 0.012,
      0.225 - panel * 0.012,
      0.2,
      panel === 1 ? "secondaryShell" : "shell",
      vector(0, -0.2 - panel * 0.22, 0),
      euler(),
      vector(1, 1, 1),
      { cutawaySurface: true },
    );
    addTorus(
      segmented,
      `${sideName} segmented thigh seam ${panel + 1}`,
      0.205 - panel * 0.01,
      0.018,
      "seam",
      vector(0, -0.3 - panel * 0.22, 0),
      euler(Math.PI / 2),
    );
  }

  const utility = new THREE.Group();
  utility.name = `${sideName} utility trouser layer`;
  utility.userData.pantsStyle = "field";
  leg.add(utility);
  addCapsule(
    utility,
    `${sideName} utility trouser shell`,
    0.245,
    0.53,
    "secondaryShell",
    vector(0, -0.43, 0),
    vector(1.05, 1, 1.08),
    euler(),
    { cutawaySurface: true },
  );
  addMesh(
    utility,
    `${sideName} utility thigh pocket`,
    new THREE.CapsuleGeometry(0.09, 0.2, 6, 14),
    "accent",
    {
      position: vector(sideName === "left" ? -0.22 : 0.22, -0.38, 0.01),
      scale: vector(0.55, 1, 0.45),
      rotation: euler(0, 0, Math.PI / 2),
    },
  );
}

function buildLeg(
  body: THREE.Group,
  registry: Map<SurfaceSuitPartId, THREE.Object3D[]>,
  side: -1 | 1,
) {
  const sideName = side < 0 ? "left" : "right";
  const kneeId = `knee-${sideName}` as SurfaceSuitPartId;
  const bootId = `boot-${sideName}` as SurfaceSuitPartId;
  const gaiterId = `dust-gaiter-${sideName}` as SurfaceSuitPartId;
  const leg = makePart(
    body,
    registry,
    "lower-body",
    `${sideName} lower-body leg pivot`,
    vector(side * 0.31, 0.12, 0),
    vector(side * 0.28, -0.18, 0.02),
  );
  addMesh(
    leg,
    `${sideName} hip pressure joint`,
    new THREE.SphereGeometry(0.25, 24, 18),
    "underlayer",
    { scale: vector(1, 0.88, 1) },
  );
  addTorus(
    leg,
    `${sideName} hip mobility ring`,
    0.22,
    0.035,
    "metal",
    vector(0, -0.04, 0),
    euler(Math.PI / 2),
  );
  addCapsule(
    leg,
    `${sideName} thigh pressure bladder`,
    0.205,
    0.58,
    "underlayer",
    vector(0, -0.43, 0),
  );
  addPantsStyleGeometry(leg, sideName);

  const knee = makePart(
    leg,
    registry,
    kneeId,
    `${sideName} knee and lower-leg assembly`,
    vector(0, -0.89, 0),
    vector(side * 0.18, -0.14, 0.08),
  );
  addMesh(
    knee,
    `${sideName} rounded knee cup`,
    new THREE.SphereGeometry(0.23, 28, 18),
    "secondaryShell",
    {
      scale: vector(1, 0.72, 1.08),
      position: vector(0, 0, 0.035),
      cutawaySurface: true,
    },
  );
  addTorus(
    knee,
    `${sideName} knee joint ring upper`,
    0.195,
    0.027,
    "accent",
    vector(0, 0.06, 0),
    euler(Math.PI / 2),
  );
  addTorus(
    knee,
    `${sideName} knee joint ring lower`,
    0.18,
    0.023,
    "metal",
    vector(0, -0.08, 0),
    euler(Math.PI / 2),
  );
  addCapsule(
    knee,
    `${sideName} shin pressure bladder`,
    0.165,
    0.57,
    "underlayer",
    vector(0, -0.43, 0),
  );
  addCylinder(
    knee,
    `${sideName} tapered shin guard`,
    0.15,
    0.205,
    0.6,
    "shell",
    vector(0, -0.42, 0.025),
    euler(),
    vector(1, 1, 1),
    { cutawaySurface: true },
  );
  addTorus(
    knee,
    `${sideName} lower-leg seam`,
    0.155,
    0.021,
    "seam",
    vector(0, -0.7, 0),
    euler(Math.PI / 2),
  );

  const boot = makePart(
    knee,
    registry,
    bootId,
    `${sideName} surface boot`,
    vector(0, -0.93, 0.09),
    vector(side * 0.12, -0.12, 0.12),
  );
  addCapsule(
    boot,
    `${sideName} rounded boot upper`,
    0.19,
    0.28,
    "secondaryShell",
    vector(0, 0.03, 0.09),
    vector(1.08, 1, 1),
    euler(Math.PI / 2, 0, 0),
  );
  addCapsule(
    boot,
    `${sideName} boot sole`,
    0.16,
    0.39,
    "underlayer",
    vector(0, -0.12, 0.13),
    vector(1.18, 0.62, 1),
    euler(Math.PI / 2, 0, 0),
  );
  addTorus(
    boot,
    `${sideName} boot toe bumper`,
    0.16,
    0.032,
    "accent",
    vector(0, -0.02, 0.35),
    euler(Math.PI / 2),
    vector(1.05, 1, 0.78),
    Math.PI,
  );

  const traverseTread = new THREE.Group();
  traverseTread.name = `${sideName} traverse tread package`;
  traverseTread.userData.bootStyle = "traverse";
  boot.add(traverseTread);
  for (let lug = 0; lug < 4; lug += 1) {
    addMesh(
      traverseTread,
      `${sideName} traverse sole lug ${lug + 1}`,
      new THREE.BoxGeometry(0.24, 0.035, 0.1),
      "accent",
      {
        position: vector(0, -0.235, -0.02 + lug * 0.12),
        rotation: euler(0, lug % 2 ? 0.16 : -0.16, 0),
        bootStyle: "traverse",
      },
    );
  }

  const rockTread = new THREE.Group();
  rockTread.name = `${sideName} rock-contact tread package`;
  rockTread.userData.bootStyle = "rock";
  boot.add(rockTread);
  for (const sideX of [-1, 1] as const) {
    for (let lug = 0; lug < 3; lug += 1) {
      addMesh(
        rockTread,
        `${sideName} rock edge lug ${sideX}-${lug}`,
        new THREE.BoxGeometry(0.11, 0.065, 0.15),
        "underlayer",
        {
          position: vector(sideX * 0.14, -0.24, lug * 0.17 - 0.06),
          rotation: euler(0, sideX * 0.12, sideX * -0.08),
          bootStyle: "rock",
        },
      );
    }
  }

  const stabilityTread = new THREE.Group();
  stabilityTread.name = `${sideName} broad stability sole package`;
  stabilityTread.userData.bootStyle = "stability";
  boot.add(stabilityTread);
  addCapsule(
    stabilityTread,
    `${sideName} broad stability contact sole`,
    0.18,
    0.45,
    "underlayer",
    vector(0, -0.22, 0.13),
    vector(1.32, 0.42, 1.06),
    euler(Math.PI / 2, 0, 0),
    { bootStyle: "stability" },
  );
  for (const sideX of [-1, 1] as const) {
    addMesh(
      stabilityTread,
      `${sideName} stability outrigger ${sideX}`,
      new THREE.SphereGeometry(0.075, 16, 10),
      "accent",
      {
        position: vector(sideX * 0.24, -0.22, 0.14),
        scale: vector(1, 0.4, 1.45),
        bootStyle: "stability",
      },
    );
  }

  const gaiter = makePart(
    boot,
    registry,
    gaiterId,
    `${sideName} dust gaiter`,
    vector(0, 0.22, -0.07),
    vector(side * 0.08, 0.08, 0),
  );
  addCylinder(
    gaiter,
    `${sideName} dust gaiter fabric`,
    0.19,
    0.23,
    0.27,
    "dust",
    vector(),
    euler(),
    vector(1, 1, 1),
    { cutawaySurface: true },
  );
  addTorus(
    gaiter,
    `${sideName} dust gaiter upper seal`,
    0.185,
    0.025,
    "accent",
    vector(0, 0.13, 0),
    euler(Math.PI / 2),
  );
  addTorus(
    gaiter,
    `${sideName} dust gaiter lower seal`,
    0.215,
    0.022,
    "seam",
    vector(0, -0.13, 0),
    euler(Math.PI / 2),
  );

  const assist = makePart(
    leg,
    registry,
    "assistive-lower-body-module",
    `${sideName} powered assist strut`,
    vector(side * 0.28, -0.43, -0.03),
    vector(side * 0.22, -0.1, -0.08),
  );
  addCylinder(
    assist,
    `${sideName} assist upper actuator`,
    0.045,
    0.055,
    0.62,
    "assist",
  );
  addMesh(
    assist,
    `${sideName} assist knee motor`,
    new THREE.SphereGeometry(0.1, 20, 14),
    "accent",
    { position: vector(0, -0.39, 0), scale: vector(0.86, 1, 0.86) },
  );
  addCylinder(
    assist,
    `${sideName} assist lower actuator`,
    0.037,
    0.046,
    0.58,
    "assist",
    vector(0, -0.72, 0),
  );

  return { leg, knee, boot };
}

function buildSuit(): SuitRig {
  const partGroups = new Map<SurfaceSuitPartId, THREE.Object3D[]>();
  const root = new THREE.Group();
  root.name = "Surface suit avatar root";
  const body = new THREE.Group();
  body.name = "Surface suit articulated body";
  root.add(body);

  const torso = makePart(
    body,
    partGroups,
    "torso-shell",
    "Torso pressure shell",
    vector(0, 0.87, 0),
    vector(0, 0.08, 0.22),
  );
  addCapsule(
    torso,
    "Torso pressure bladder",
    0.48,
    0.58,
    "underlayer",
    vector(0, -0.02, 0),
    vector(1.14, 1, 0.82),
  );
  addMesh(
    torso,
    "Anatomically tapered pressure torso",
    anatomicalTorsoGeometry(),
    "shell",
    {
      scale: vector(1, 0.92, 0.73),
      position: vector(0, 0.1, 0),
      cutawaySurface: true,
    },
  );
  addCylinder(
    torso,
    "Torso tapered waist shell",
    0.48,
    0.58,
    0.57,
    "secondaryShell",
    vector(0, -0.38, 0),
    euler(),
    vector(1, 1, 0.76),
    { cutawaySurface: true },
  );
  addTorus(
    torso,
    "Torso waist pressure seam",
    0.47,
    0.035,
    "seam",
    vector(0, -0.65, 0),
    euler(Math.PI / 2),
    vector(1, 1, 0.78),
  );

  const torsoLayers = makePart(
    torso,
    partGroups,
    "torso-layers",
    "Torso protective layers",
    vector(0, 0.08, 0.43),
    vector(0, 0, 0.3),
  );
  addMesh(
    torsoLayers,
    "Tailored layered chest impact panel",
    tailoredPanelGeometry([
      [-0.42, -0.36],
      [-0.49, 0.16],
      [-0.28, 0.46],
      [0, 0.56],
      [0.28, 0.46],
      [0.49, 0.16],
      [0.42, -0.36],
      [0, -0.48],
    ], 0.08),
    "secondaryShell",
    {
      position: vector(0, 0.03, 0.11),
      cutawaySurface: true,
    },
  );
  for (let rib = 0; rib < 3; rib += 1) {
    addTorus(
      torsoLayers,
      `Chest layer seam ${rib + 1}`,
      0.34 - rib * 0.035,
      0.018,
      rib === 1 ? "accent" : "seam",
      vector(0, 0.22 - rib * 0.2, 0.1),
      euler(),
      vector(1.18, 0.52, 1),
      Math.PI,
    );
  }
  addMesh(
    torsoLayers,
    "Chest status medallion",
    new THREE.CylinderGeometry(0.085, 0.085, 0.03, 24),
    "light",
    { position: vector(0.3, 0.17, 0.1), rotation: euler(Math.PI / 2) },
  );

  const streamlineTailoring = new THREE.Group();
  streamlineTailoring.name = "Streamline torso tailoring";
  streamlineTailoring.userData.torsoStyle = "streamline";
  torsoLayers.add(streamlineTailoring);
  for (const side of [-1, 1] as const) {
    addMesh(
      streamlineTailoring,
      `${side < 0 ? "left" : "right"} streamline clavicle panel`,
      tailoredPanelGeometry([
        [0, -0.08],
        [0.32, -0.02],
        [0.41, 0.13],
        [0.12, 0.08],
      ], 0.045),
      "shell",
      {
        position: vector(side * 0.24, 0.31, 0.18),
        rotation: euler(0, side * -0.08, side * -0.14),
        torsoStyle: "streamline",
      },
    );
  }

  const fieldRigTailoring = new THREE.Group();
  fieldRigTailoring.name = "Field rig torso tailoring";
  fieldRigTailoring.userData.torsoStyle = "field-rig";
  torsoLayers.add(fieldRigTailoring);
  addMesh(
    fieldRigTailoring,
    "Field rig recessed service panel",
    new THREE.BoxGeometry(0.56, 0.34, 0.075, 3, 3, 1),
    "shell",
    { position: vector(0, 0.02, 0.17), torsoStyle: "field-rig" },
  );
  for (const side of [-1, 1] as const) {
    addCapsule(
      fieldRigTailoring,
      `${side < 0 ? "left" : "right"} field attachment rail`,
      0.035,
      0.48,
      "accent",
      vector(side * 0.42, 0.02, 0.16),
      vector(0.7, 1, 0.7),
      euler(0, 0, side * -0.12),
      { torsoStyle: "field-rig" },
    );
  }

  const adaptiveTailoring = new THREE.Group();
  adaptiveTailoring.name = "Adaptive lattice torso tailoring";
  adaptiveTailoring.userData.torsoStyle = "adaptive";
  torsoLayers.add(adaptiveTailoring);
  for (let band = 0; band < 5; band += 1) {
    addTorus(
      adaptiveTailoring,
      `Adaptive chest lattice band ${band + 1}`,
      0.29 + band * 0.035,
      0.018,
      band % 2 ? "accent" : "metal",
      vector(0, 0.26 - band * 0.14, 0.18),
      euler(),
      vector(1.18, 0.48, 1),
      Math.PI,
    ).userData.torsoStyle = "adaptive";
  }

  const haptics = makePart(
    torsoLayers,
    partGroups,
    "haptic-module",
    "Torso haptic feedback module",
    vector(-0.3, -0.08, 0.11),
    vector(-0.12, 0, 0.14),
  );
  for (let node = 0; node < 4; node += 1) {
    addMesh(
      haptics,
      `Haptic feedback puck ${node + 1}`,
      new THREE.CylinderGeometry(0.038, 0.038, 0.025, 18),
      "haptic",
      {
        position: vector((node % 2) * 0.11, Math.floor(node / 2) * -0.11, 0),
        rotation: euler(Math.PI / 2),
      },
    );
  }

  const pelvis = makePart(
    body,
    partGroups,
    "lower-body",
    "Lower-body pressure garment pelvis",
    vector(0, 0.1, 0),
    vector(0, -0.14, 0.08),
  );
  addMesh(
    pelvis,
    "Rounded lower-body pelvis shell",
    new THREE.SphereGeometry(0.55, 34, 22),
    "secondaryShell",
    {
      scale: vector(1, 0.58, 0.77),
      cutawaySurface: true,
    },
  );
  addTorus(
    pelvis,
    "Lower-body waist bearing",
    0.45,
    0.052,
    "metal",
    vector(0, 0.25, 0),
    euler(Math.PI / 2),
    vector(1, 1, 0.83),
  );
  addTorus(
    pelvis,
    "Lower-body accent seal",
    0.43,
    0.021,
    "accent",
    vector(0, 0.29, 0),
    euler(Math.PI / 2),
    vector(1, 1, 0.83),
  );

  const helmetAssembly = new THREE.Group();
  helmetAssembly.name = "Detachable helmet assembly";
  helmetAssembly.position.set(0, 1.87, 0);
  helmetAssembly.userData.basePosition = helmetAssembly.position.clone();
  body.add(helmetAssembly);

  const pressureShell = makePart(
    helmetAssembly,
    partGroups,
    "helmet-pressure-shell",
    "Helmet pressure shell",
    vector(),
    vector(0, 0.28, -0.04),
  );
  addMesh(
    pressureShell,
    "Sculpted rear helmet pressure shell",
    new THREE.SphereGeometry(0.54, 48, 32, Math.PI, Math.PI, 0, Math.PI),
    "shell",
    { scale: vector(1, 1.04, 0.96), cutawaySurface: true },
  );
  addTorus(
    pressureShell,
    "Helmet crown seam",
    0.42,
    0.018,
    "seam",
    vector(0, 0.24, 0),
    euler(Math.PI / 2),
    vector(1, 1, 1.04),
  );

  const visor = makePart(
    helmetAssembly,
    partGroups,
    "helmet-visor",
    "Helmet primary visor",
    vector(0, 0.01, 0.37),
    vector(0, 0, 0.24),
  );
  addMesh(
    visor,
    "Curved primary pressure visor",
    new THREE.SphereGeometry(0.48, 48, 30),
    "visor",
    { scale: vector(0.91, 0.77, 0.46), cutawaySurface: true },
  );
  addTorus(
    visor,
    "Visor pressure rim",
    0.4,
    0.025,
    "metal",
    vector(0, 0, 0.1),
    euler(),
    vector(1, 0.82, 1),
  );

  const sunVisor = makePart(
    helmetAssembly,
    partGroups,
    "helmet-sun-visor",
    "Helmet retractable sun visor",
    vector(0, 0.07, 0.51),
    vector(0, 0.12, 0.28),
  );
  addMesh(
    sunVisor,
    "Tinted retractable sun visor surface",
    new THREE.SphereGeometry(0.43, 42, 20, 0, Math.PI * 2, 0.12, 1.34),
    "sunVisor",
    { scale: vector(0.9, 0.72, 0.2), cutawaySurface: true },
  );
  addTorus(
    sunVisor,
    "Sun visor brow rail",
    0.34,
    0.025,
    "accent",
    vector(0, 0.18, 0.03),
    euler(),
    vector(1.12, 0.62, 1),
    Math.PI,
  );

  const neckRing = makePart(
    helmetAssembly,
    partGroups,
    "helmet-neck-ring",
    "Helmet neck bearing ring",
    vector(0, -0.53, 0),
    vector(0, -0.12, 0.06),
  );
  addTorus(
    neckRing,
    "Helmet neck pressure bearing",
    0.37,
    0.07,
    "metal",
    vector(),
    euler(Math.PI / 2),
    vector(1, 1, 0.9),
  );
  addTorus(
    neckRing,
    "Helmet neck bearing accent",
    0.37,
    0.021,
    "accent",
    vector(0, 0.04, 0),
    euler(Math.PI / 2),
    vector(1, 1, 0.9),
  );

  const catEarPods = makePart(
    helmetAssembly,
    partGroups,
    "helmet-cat-ear-pods",
    "Helmet cat-ear sensor pods",
    vector(0, 0.38, -0.02),
    vector(0, 0.22, -0.02),
  );
  for (const side of [-1, 1] as const) {
    addMesh(
      catEarPods,
      `${side < 0 ? "left" : "right"} tapered cat-ear sensor pod`,
      new THREE.ConeGeometry(0.14, 0.32, 6, 3),
      "secondaryShell",
      {
        position: vector(side * 0.31, 0.14, -0.02),
        rotation: euler(0, 0, side * -0.15),
        scale: vector(0.85, 1, 0.72),
      },
    );
    addMesh(
      catEarPods,
      `${side < 0 ? "left" : "right"} cat-ear sensor light`,
      new THREE.SphereGeometry(0.045, 18, 12),
      "light",
      { position: vector(side * 0.31, 0.13, 0.085) },
    );
  }

  const helmetLights = makePart(
    helmetAssembly,
    partGroups,
    "helmet-lights",
    "Helmet illumination cluster",
    vector(0, -0.05, 0.5),
    vector(0, 0, 0.24),
  );
  for (const side of [-1, 1] as const) {
    addMesh(
      helmetLights,
      `${side < 0 ? "left" : "right"} helmet lamp`,
      new THREE.SphereGeometry(0.055, 18, 12),
      "light",
      { position: vector(side * 0.39, 0.07, 0) },
    );
    addTorus(
      helmetLights,
      `${side < 0 ? "left" : "right"} helmet lamp bezel`,
      0.069,
      0.014,
      "metal",
      vector(side * 0.39, 0.07, -0.008),
    );
  }

  const undercap = new THREE.Group();
  undercap.name = "Display-mode human head and communications cap";
  undercap.position.set(0, 1.82, 0.01);
  body.add(undercap);
  addMesh(
    undercap,
    "Anatomical display head",
    new THREE.SphereGeometry(0.31, 40, 28),
    "skin",
    { scale: vector(0.84, 1.06, 0.88) },
  );
  addMesh(
    undercap,
    "Communications cap crown",
    new THREE.SphereGeometry(0.318, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.54),
    "underlayer",
    { position: vector(0, 0.04, -0.005), scale: vector(0.86, 1.02, 0.9) },
  );
  addCapsule(
    undercap,
    "Display-mode nose",
    0.035,
    0.075,
    "skin",
    vector(0, -0.015, 0.292),
    vector(0.7, 1, 0.8),
    euler(Math.PI / 2, 0, 0),
  );
  for (const side of [-1, 1] as const) {
    addMesh(
      undercap,
      `${side < 0 ? "left" : "right"} display eye`,
      new THREE.SphereGeometry(0.024, 16, 10),
      "hair",
      { position: vector(side * 0.105, 0.055, 0.27), scale: vector(1, 0.55, 0.45) },
    );
    addMesh(
      undercap,
      `${side < 0 ? "left" : "right"} display ear`,
      new THREE.SphereGeometry(0.052, 16, 12),
      "skin",
      { position: vector(side * 0.276, -0.01, 0), scale: vector(0.45, 1, 0.55) },
    );
  }
  addMesh(
    undercap,
    "Display-mode mouth",
    new THREE.TorusGeometry(0.06, 0.008, 8, 20, Math.PI),
    "hair",
    { position: vector(0, -0.12, 0.274), rotation: euler(0, 0, Math.PI) },
  );
  addCylinder(
    undercap,
    "Display-mode neck",
    0.13,
    0.15,
    0.24,
    "skin",
    vector(0, -0.38, 0),
  );

  const backpack = makePart(
    body,
    partGroups,
    "backpack",
    "Life-support backpack",
    vector(0, 0.92, -0.55),
    vector(0, 0.08, -0.42),
  );
  addCapsule(
    backpack,
    "Rounded life-support backpack shell",
    0.42,
    0.72,
    "secondaryShell",
    vector(0, 0, 0),
    vector(1.05, 1, 0.48),
    euler(),
    { cutawaySurface: true },
  );
  for (const side of [-1, 1] as const) {
    addCylinder(
      backpack,
      `${side < 0 ? "left" : "right"} consumables vessel`,
      0.11,
      0.11,
      0.66,
      "metal",
      vector(side * 0.29, 0, -0.03),
    );
    addTorus(
      backpack,
      `${side < 0 ? "left" : "right"} vessel restraint`,
      0.115,
      0.018,
      "accent",
      vector(side * 0.29, 0.1, -0.03),
      euler(Math.PI / 2),
    );
  }
  const hoseCurve = new THREE.CatmullRomCurve3([
    vector(-0.28, 0.28, 0),
    vector(-0.5, 0.35, 0.08),
    vector(-0.57, 0.55, 0.3),
  ]);
  addMesh(
    backpack,
    "Flexible life-support shoulder hose",
    new THREE.TubeGeometry(hoseCurve, 28, 0.035, 10, false),
    "underlayer",
  );
  addMesh(
    backpack,
    "Life-support service panel",
    tailoredPanelGeometry([
      [-0.24, -0.23],
      [-0.28, 0.23],
      [0.28, 0.23],
      [0.24, -0.23],
    ], 0.045),
    "shell",
    { position: vector(0, 0.1, -0.31), rotation: euler(0, Math.PI, 0) },
  );
  for (let fin = 0; fin < 5; fin += 1) {
    addMesh(
      backpack,
      `Life-support heat-rejection fin ${fin + 1}`,
      new THREE.BoxGeometry(0.38, 0.025, 0.05),
      fin === 2 ? "accent" : "metal",
      { position: vector(0, 0.35 - fin * 0.16, -0.37) },
    );
  }

  const leftArmBuild = buildArm(body, partGroups, -1);
  const rightArmBuild = buildArm(body, partGroups, 1);
  const leftLegBuild = buildLeg(body, partGroups, -1);
  const rightLegBuild = buildLeg(body, partGroups, 1);

  const shoulderCamera = makePart(
    body,
    partGroups,
    "shoulder-camera",
    "Shoulder documentation camera",
    vector(0.68, 1.34, 0.18),
    vector(0.22, 0.1, 0.12),
  );
  addMesh(
    shoulderCamera,
    "Aerodynamic shoulder camera fairing",
    tailoredPanelGeometry([
      [-0.16, -0.1],
      [-0.12, 0.15],
      [0.12, 0.15],
      [0.18, -0.06],
      [0, -0.16],
    ], 0.12),
    "secondaryShell",
    { rotation: euler(-0.16, 0.24, -0.08) },
  );
  addMesh(
    shoulderCamera,
    "Shoulder camera optical window",
    new THREE.CylinderGeometry(0.055, 0.066, 0.04, 24),
    "visor",
    { position: vector(0.03, 0.01, 0.11), rotation: euler(Math.PI / 2) },
  );
  addMesh(
    shoulderCamera,
    "Shoulder camera task lamp",
    new THREE.SphereGeometry(0.035, 16, 10),
    "light",
    { position: vector(-0.09, -0.035, 0.1) },
  );

  const tetherReel = makePart(
    pelvis,
    partGroups,
    "tether-reel",
    "Auxiliary retractable tether reel",
    vector(-0.48, -0.05, 0.18),
    vector(-0.2, -0.05, 0.12),
  );
  addMesh(
    tetherReel,
    "Tether reel protective housing",
    new THREE.CylinderGeometry(0.13, 0.13, 0.09, 32),
    "secondaryShell",
    { rotation: euler(Math.PI / 2), scale: vector(1, 1, 0.82) },
  );
  addTorus(tetherReel, "Tether reel accent bezel", 0.095, 0.018, "accent", vector(0, 0, 0.055));
  addCapsule(
    tetherReel,
    "Tether emergency release tab",
    0.025,
    0.09,
    "haptic",
    vector(-0.12, -0.1, 0.04),
    vector(0.8, 1, 0.8),
    euler(0, 0, 0.45),
  );

  const sampleKit = makePart(
    leftLegBuild.leg,
    partGroups,
    "sample-kit",
    "Sealed sample and tool kit",
    vector(-0.28, -0.45, 0.1),
    vector(-0.24, -0.03, 0.14),
  );
  addMesh(
    sampleKit,
    "Sculpted sample carrier shell",
    tailoredPanelGeometry([
      [-0.15, -0.25],
      [-0.19, 0.19],
      [-0.11, 0.29],
      [0.13, 0.25],
      [0.18, -0.22],
      [0, -0.29],
    ], 0.13),
    "secondaryShell",
    { rotation: euler(0, -0.16, -0.06) },
  );
  addCapsule(
    sampleKit,
    "Sample kit dust-sealed latch",
    0.025,
    0.16,
    "accent",
    vector(0.08, 0.02, 0.1),
    vector(0.75, 1, 0.75),
  );

  const assistHip = makePart(
    pelvis,
    partGroups,
    "assistive-lower-body-module",
    "Assistive lower-body hip controller",
    vector(0, 0.07, -0.33),
    vector(0, 0.03, -0.22),
  );
  addTorus(
    assistHip,
    "Assistive hip load-transfer arc",
    0.45,
    0.045,
    "assist",
    vector(),
    euler(0, 0, Math.PI),
    vector(1, 0.68, 1),
    Math.PI,
  );
  addMesh(
    assistHip,
    "Assistive controller status light",
    new THREE.SphereGeometry(0.05, 16, 12),
    "light",
    { position: vector(0, 0.17, -0.03) },
  );

  const staffGroup = makePart(
    body,
    partGroups,
    "walking-staff",
    "Optional walking staff",
    vector(1.07, 0.05, 0.1),
    vector(0.2, -0.08, 0.1),
  );
  staffGroup.rotation.z = -0.06;
  addCylinder(
    staffGroup,
    "Walking staff tapered shaft",
    0.028,
    0.045,
    2.45,
    "assist",
    vector(0, -0.72, 0),
  );
  addTorus(
    staffGroup,
    "Walking staff rounded grip",
    0.13,
    0.035,
    "underlayer",
    vector(0.07, 0.49, 0),
    euler(0, Math.PI / 2, 0),
    vector(1, 0.68, 1),
    Math.PI * 1.35,
  );
  addCylinder(
    staffGroup,
    "Walking staff broad replaceable foot",
    0.14,
    0.18,
    0.075,
    "underlayer",
    vector(0, -1.98, 0),
  );
  addTorus(
    staffGroup,
    "Walking staff force-sensing foot ring",
    0.13,
    0.018,
    "accent",
    vector(0, -1.93, 0),
    euler(Math.PI / 2),
  );

  // The common pressure architecture above is shared by the two EVA studies.
  // Mark it before adding the concept overlays so VECTOR can become a visibly
  // lighter Earth garment without implying that it contains a pressure shell.
  const vectorRelevantAccessories = new Set<SurfaceSuitPartId>([
    "walking-staff",
    "assistive-lower-body-module",
    "haptic-module",
    "shoulder-camera",
  ]);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const partId = nearestPartId(object);
    if (!partId || !vectorRelevantAccessories.has(partId)) {
      object.userData.conceptBase = "eva";
    }
  });

  // SELENE: a high-contrast lunar architecture with broad dust guards,
  // shadow-work lighting rails, and a faceted upper-shell silhouette.
  const seleneChest = makeConceptGroup(
    torsoLayers,
    "selene",
    "SELENE lunar chest architecture",
  );
  for (const side of [-1, 1] as const) {
    addMesh(
      seleneChest,
      `${side < 0 ? "Left" : "Right"} SELENE clavicle guard`,
      tailoredPanelGeometry([
        [-0.04, -0.2],
        [0.28, -0.15],
        [0.38, 0.12],
        [0.18, 0.28],
        [-0.08, 0.18],
      ], 0.06),
      "shell",
      {
        position: vector(side * 0.26, 0.21, 0.22),
        rotation: euler(-0.04, side * -0.1, side * -0.12),
      },
    );
    addCapsule(
      seleneChest,
      `${side < 0 ? "Left" : "Right"} SELENE shadow-work light rail`,
      0.026,
      0.42,
      "light",
      vector(side * 0.42, 0.02, 0.22),
      vector(0.72, 1, 0.72),
      euler(0, 0, side * -0.12),
    );
  }
  const seleneHelmet = makeConceptGroup(
    pressureShell,
    "selene",
    "SELENE lunar helmet crown and optics",
  );
  addTorus(
    seleneHelmet,
    "SELENE low-profile helmet brow guard",
    0.44,
    0.038,
    "secondaryShell",
    vector(0, 0.15, 0.22),
    euler(),
    vector(1.02, 0.68, 1),
    Math.PI,
  );
  for (const side of [-1, 1] as const) {
    addMesh(
      seleneHelmet,
      `${side < 0 ? "Left" : "Right"} SELENE horizon lamp`,
      new THREE.OctahedronGeometry(0.075, 2),
      "light",
      { position: vector(side * 0.43, 0.04, 0.28), scale: vector(0.8, 0.6, 1) },
    );
    const shoulderOverlay = makeConceptGroup(
      side < 0 ? leftArmBuild.shoulder : rightArmBuild.shoulder,
      "selene",
      `${side < 0 ? "Left" : "Right"} SELENE shoulder shield`,
    );
    addMesh(
      shoulderOverlay,
      `${side < 0 ? "Left" : "Right"} SELENE faceted shoulder shield`,
      new THREE.DodecahedronGeometry(0.285, 1),
      "shell",
      { scale: vector(1.16, 0.78, 1.02), position: vector(0, 0.01, 0.01) },
    );
    const bootOverlay = makeConceptGroup(
      side < 0 ? leftLegBuild.boot : rightLegBuild.boot,
      "selene",
      `${side < 0 ? "Left" : "Right"} SELENE lunar boot guard`,
    );
    addMesh(
      bootOverlay,
      `${side < 0 ? "Left" : "Right"} SELENE broad dust-shedding oversole`,
      new THREE.ExtrudeGeometry(
        new THREE.Shape()
          .moveTo(-0.22, -0.32)
          .lineTo(0.22, -0.32)
          .lineTo(0.28, 0.3)
          .lineTo(0.16, 0.48)
          .lineTo(-0.16, 0.48)
          .lineTo(-0.28, 0.3)
          .closePath(),
        { depth: 0.08, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02 },
      ),
      "secondaryShell",
      {
        position: vector(0, -0.22, 0.1),
        rotation: euler(Math.PI / 2, 0, 0),
        scale: vector(1.05, 1.12, 1),
      },
    );
  }

  // AREO: an asymmetric geology rig with protected sample interfaces and
  // lower-profile panels intended to read differently from the lunar system.
  const areoChest = makeConceptGroup(
    torsoLayers,
    "areo",
    "AREO geology chest architecture",
  );
  for (let band = 0; band < 4; band += 1) {
    addMesh(
      areoChest,
      `AREO layered abrasion lamella ${band + 1}`,
      tailoredPanelGeometry([
        [-0.34 + band * 0.025, -0.07],
        [0.34 - band * 0.025, -0.07],
        [0.29 - band * 0.018, 0.08],
        [-0.29 + band * 0.018, 0.08],
      ], 0.035),
      band === 1 ? "accent" : band === 3 ? "metal" : "secondaryShell",
      { position: vector(0, 0.3 - band * 0.17, 0.23 + band * 0.008) },
    );
  }
  addMesh(
    areoChest,
    "AREO sealed geology manifest pocket",
    tailoredPanelGeometry([
      [-0.14, -0.17],
      [0.14, -0.15],
      [0.17, 0.13],
      [-0.1, 0.18],
    ], 0.08),
    "shell",
    { position: vector(0.3, -0.18, 0.24), rotation: euler(0, -0.08, -0.08) },
  );
  const areoHelmet = makeConceptGroup(
    pressureShell,
    "areo",
    "AREO Mars helmet dust architecture",
  );
  addMesh(
    areoHelmet,
    "AREO visor dust brow",
    tailoredPanelGeometry([
      [-0.42, -0.08],
      [0.42, -0.08],
      [0.31, 0.11],
      [-0.28, 0.14],
    ], 0.08),
    "secondaryShell",
    { position: vector(0, 0.2, 0.36), rotation: euler(-0.16, 0, 0) },
  );
  for (const side of [-1, 1] as const) {
    const shoulderOverlay = makeConceptGroup(
      side < 0 ? leftArmBuild.shoulder : rightArmBuild.shoulder,
      "areo",
      `${side < 0 ? "Left" : "Right"} AREO field shoulder`,
    );
    addMesh(
      shoulderOverlay,
      `${side < 0 ? "Left" : "Right"} AREO layered shoulder tile`,
      tailoredPanelGeometry([
        [-0.22, -0.12],
        [0.23, -0.12],
        [0.17, 0.17],
        [-0.11, 0.22],
      ], 0.075),
      side < 0 ? "secondaryShell" : "accent",
      { position: vector(0, 0.03, 0.22), rotation: euler(-0.2, 0, 0) },
    );
    const shinOverlay = makeConceptGroup(
      side < 0 ? leftLegBuild.knee : rightLegBuild.knee,
      "areo",
      `${side < 0 ? "Left" : "Right"} AREO shin armor`,
    );
    addMesh(
      shinOverlay,
      `${side < 0 ? "Left" : "Right"} AREO replaceable shin abrasion tile`,
      tailoredPanelGeometry([
        [-0.13, -0.31],
        [0.13, -0.31],
        [0.18, 0.25],
        [0, 0.36],
        [-0.18, 0.25],
      ], 0.065),
      "secondaryShell",
      { position: vector(0, -0.42, 0.2), rotation: euler(-0.05, 0, 0) },
    );
  }

  // VECTOR is intentionally not an EVA suit. Its close-fitting textile volume,
  // visible wearer, loading harness, and open head distinguish an Earth test
  // garment from the pressure architecture used by SELENE and AREO.
  const vectorGarment = makeConceptGroup(
    body,
    "vector",
    "VECTOR Earth mobility research garment",
  );
  vectorGarment.userData.partId = "torso-layers" satisfies SurfaceSuitPartId;
  const vectorTorsoGroups = partGroups.get("torso-layers") ?? [];
  vectorTorsoGroups.push(vectorGarment);
  partGroups.set("torso-layers", vectorTorsoGroups);
  addMesh(
    vectorGarment,
    "VECTOR anatomical knit torso",
    anatomicalTorsoGeometry(),
    "underlayer",
    { scale: vector(0.86, 0.86, 0.57), position: vector(0, 0.96, 0) },
  );
  addMesh(
    vectorGarment,
    "VECTOR knitted sternum loading panel",
    tailoredPanelGeometry([
      [-0.23, -0.42],
      [0.23, -0.42],
      [0.31, 0.25],
      [0, 0.48],
      [-0.31, 0.25],
    ], 0.035),
    "secondaryShell",
    { position: vector(0, 1.03, 0.34) },
  );
  const vectorMonitoring = makePart(
    vectorGarment,
    partGroups,
    "vector-monitoring",
    "VECTOR removable physiological monitoring cluster",
  );
  for (const [index, sensorPosition] of [
    vector(-0.2, 1.18, 0.405),
    vector(0.2, 1.18, 0.405),
    vector(0, 0.83, 0.405),
  ].entries()) {
    addMesh(
      vectorMonitoring,
      `VECTOR removable garment sensor ${index + 1}`,
      new THREE.CylinderGeometry(0.046, 0.052, 0.025, 20),
      "haptic",
      { position: sensorPosition, rotation: euler(Math.PI / 2, 0, 0) },
    );
  }
  for (const side of [-1, 1] as const) {
    addCapsule(
      vectorGarment,
      `${side < 0 ? "Left" : "Right"} VECTOR diagonal load strap`,
      0.027,
      0.94,
      "accent",
      vector(side * 0.17, 0.92, 0.37),
      vector(0.7, 1, 0.6),
      euler(0, 0, side * -0.31),
    );
  }
  addTorus(
    vectorGarment,
    "VECTOR waist load-transfer belt",
    0.41,
    0.045,
    "assist",
    vector(0, 0.23, 0),
    euler(Math.PI / 2),
    vector(1, 1, 0.67),
  );
  addMesh(
    vectorGarment,
    "VECTOR close-fitting hip garment",
    new THREE.SphereGeometry(0.47, 34, 22),
    "underlayer",
    { position: vector(0, 0.14, 0), scale: vector(1, 0.54, 0.68) },
  );
  addMesh(
    vectorGarment,
    "VECTOR uncovered research participant head",
    new THREE.SphereGeometry(0.3, 40, 28),
    "skin",
    { position: vector(0, 1.9, 0.02), scale: vector(0.82, 1.06, 0.88) },
  );
  addMesh(
    vectorGarment,
    "VECTOR participant hair",
    new THREE.SphereGeometry(0.307, 40, 22, 0, Math.PI * 2, 0, Math.PI * 0.54),
    "hair",
    { position: vector(0, 1.96, 0.005), scale: vector(0.85, 1.02, 0.9) },
  );
  addCapsule(
    vectorGarment,
    "VECTOR participant nose",
    0.034,
    0.07,
    "skin",
    vector(0, 1.88, 0.3),
    vector(0.7, 1, 0.8),
    euler(Math.PI / 2, 0, 0),
  );
  for (const side of [-1, 1] as const) {
    addMesh(
      vectorGarment,
      `${side < 0 ? "Left" : "Right"} VECTOR participant eye`,
      new THREE.SphereGeometry(0.023, 16, 10),
      "hair",
      { position: vector(side * 0.1, 1.94, 0.286), scale: vector(1, 0.55, 0.45) },
    );
    addMesh(
      vectorGarment,
      `${side < 0 ? "Left" : "Right"} VECTOR participant ear`,
      new THREE.SphereGeometry(0.05, 16, 12),
      "skin",
      { position: vector(side * 0.265, 1.88, 0.01), scale: vector(0.42, 1, 0.55) },
    );
    const upperArm = makeConceptGroup(
      side < 0 ? leftArmBuild.shoulder : rightArmBuild.shoulder,
      "vector",
      `${side < 0 ? "Left" : "Right"} VECTOR upper sleeve`,
    );
    addCapsule(
      upperArm,
      `${side < 0 ? "Left" : "Right"} VECTOR textile upper sleeve`,
      0.145,
      0.55,
      "underlayer",
      vector(0, -0.39, 0),
      vector(0.9, 1, 0.82),
    );
    addCapsule(
      upperArm,
      `${side < 0 ? "Left" : "Right"} VECTOR upper-arm load band`,
      0.157,
      0.12,
      "assist",
      vector(0, -0.31, 0),
      vector(0.9, 1, 0.82),
    );
    const lowerArm = makeConceptGroup(
      side < 0 ? leftArmBuild.elbow : rightArmBuild.elbow,
      "vector",
      `${side < 0 ? "Left" : "Right"} VECTOR forearm sleeve`,
    );
    addCapsule(
      lowerArm,
      `${side < 0 ? "Left" : "Right"} VECTOR textile forearm`,
      0.12,
      0.5,
      "underlayer",
      vector(0, -0.38, 0),
      vector(0.88, 1, 0.8),
    );
    addCapsule(
      lowerArm,
      `${side < 0 ? "Left" : "Right"} VECTOR bare hand`,
      0.105,
      0.2,
      "skin",
      vector(0, -0.79, 0.01),
      vector(0.9, 1, 0.68),
    );
    const upperLeg = makeConceptGroup(
      side < 0 ? leftLegBuild.leg : rightLegBuild.leg,
      "vector",
      `${side < 0 ? "Left" : "Right"} VECTOR upper leg garment`,
    );
    addCapsule(
      upperLeg,
      `${side < 0 ? "Left" : "Right"} VECTOR anatomical trouser leg`,
      0.185,
      0.69,
      "underlayer",
      vector(0, -0.44, 0),
      vector(0.94, 1, 0.82),
    );
    addCapsule(
      upperLeg,
      `${side < 0 ? "Left" : "Right"} VECTOR thigh loading band`,
      0.198,
      0.13,
      "assist",
      vector(0, -0.41, 0),
      vector(0.95, 1, 0.84),
    );
    const lowerLeg = makeConceptGroup(
      side < 0 ? leftLegBuild.knee : rightLegBuild.knee,
      "vector",
      `${side < 0 ? "Left" : "Right"} VECTOR lower leg garment`,
    );
    addCapsule(
      lowerLeg,
      `${side < 0 ? "Left" : "Right"} VECTOR lower textile leg`,
      0.135,
      0.61,
      "underlayer",
      vector(0, -0.43, 0),
      vector(0.9, 1, 0.8),
    );
    const trainingShoe = makeConceptGroup(
      side < 0 ? leftLegBuild.boot : rightLegBuild.boot,
      "vector",
      `${side < 0 ? "Left" : "Right"} VECTOR instrumented training shoe`,
    );
    addMesh(
      trainingShoe,
      `${side < 0 ? "Left" : "Right"} VECTOR pressure-sensing training shoe`,
      new THREE.CapsuleGeometry(0.15, 0.34, 8, 24),
      "secondaryShell",
      {
        position: vector(0, -0.09, 0.2),
        rotation: euler(Math.PI / 2, 0, 0),
        scale: vector(0.85, 1.08, 0.55),
      },
    );
    addMesh(
      trainingShoe,
      `${side < 0 ? "Left" : "Right"} VECTOR force-sensing sole`,
      new THREE.BoxGeometry(0.26, 0.055, 0.55, 4, 1, 8),
      "haptic",
      { position: vector(0, -0.2, 0.2) },
    );
  }
  addMesh(
    vectorGarment,
    "VECTOR participant mouth",
    new THREE.TorusGeometry(0.058, 0.007, 8, 20, Math.PI),
    "hair",
    { position: vector(0, 1.79, 0.282), rotation: euler(0, 0, Math.PI) },
  );

  const testEffects = new Map<Exclude<SurfaceSuitTestMode, "none">, THREE.Group>();
  const makeEffectGroup = (mode: Exclude<SurfaceSuitTestMode, "none">) => {
    const group = new THREE.Group();
    group.name = `Illustrative ${mode} test effect`;
    group.visible = false;
    group.userData.testEffect = mode;
    body.add(group);
    testEffects.set(mode, group);
    return group;
  };

  const uvEffect = makeEffectGroup("uv");
  const uvMaterial = new THREE.LineBasicMaterial({
    color: "#8d6cff",
    transparent: true,
    opacity: 0.82,
  });
  for (let ray = 0; ray < 5; ray += 1) {
    const y = 1.56 + ray * 0.15;
    const incoming = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        vector(-2.2, y + 1.15, 0.62),
        vector(-0.24 + ray * 0.11, y, 0.62),
      ]),
      uvMaterial.clone(),
    );
    incoming.name = `Incident ultraviolet ray ${ray + 1}`;
    uvEffect.add(incoming);
    const reflected = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        vector(-0.24 + ray * 0.11, y, 0.62),
        vector(1.08 + ray * 0.12, y + 0.76, 0.7),
      ]),
      uvMaterial.clone(),
    );
    reflected.name = `Illustrative reflected ultraviolet ray ${ray + 1}`;
    uvEffect.add(reflected);
  }

  const dustEffect = makeEffectGroup("dust");
  const dustPositions: number[] = [];
  for (let particle = 0; particle < 90; particle += 1) {
    const side = particle % 2 === 0 ? -1 : 1;
    dustPositions.push(
      side * (0.18 + ((particle * 17) % 37) / 55),
      -2.12 + ((particle * 23) % 31) / 58,
      -0.32 + ((particle * 29) % 41) / 58,
    );
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.Float32BufferAttribute(dustPositions, 3));
  const dustCloud = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      color: "#b08b65",
      size: 0.035,
      transparent: true,
      opacity: 0.78,
      sizeAttenuation: true,
    }),
  );
  dustCloud.name = "Illustrative diverted dust particles";
  dustEffect.add(dustCloud);

  const lightEffect = makeEffectGroup("lighting");
  const lightBeam = new THREE.Mesh(
    new THREE.ConeGeometry(0.68, 2.8, 40, 1, true),
    new THREE.MeshBasicMaterial({
      color: "#a6efff",
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  lightBeam.name = "Illustrative helmet task-light beam";
  lightBeam.position.set(0, 1.78, 1.84);
  lightBeam.rotation.x = Math.PI / 2;
  lightEffect.add(lightBeam);

  const signalEffect = makeEffectGroup("signal");
  for (let ring = 0; ring < 4; ring += 1) {
    const signalRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.62 + ring * 0.24, 0.012, 8, 64),
      new THREE.MeshBasicMaterial({
        color: "#8266e8",
        transparent: true,
        opacity: 0.42 - ring * 0.07,
        depthWrite: false,
      }),
    );
    signalRing.name = `Illustrative radio signal ring ${ring + 1}`;
    signalRing.position.set(0, 2.18, -0.03);
    signalRing.rotation.x = Math.PI / 2;
    signalRing.userData.signalPhase = ring * 0.22;
    signalEffect.add(signalRing);
  }

  const hapticEffect = makeEffectGroup("haptic");
  for (let pulse = 0; pulse < 3; pulse += 1) {
    const pulseRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.18 + pulse * 0.1, 0.014, 8, 48),
      new THREE.MeshBasicMaterial({
        color: "#f2a5d2",
        transparent: true,
        opacity: 0.55 - pulse * 0.12,
        depthWrite: false,
      }),
    );
    pulseRing.name = `Illustrative haptic pulse ${pulse + 1}`;
    pulseRing.position.set(-0.25, 0.82, 0.64);
    pulseRing.userData.hapticPhase = pulse * 0.33;
    hapticEffect.add(pulseRing);
  }

  const supportEffect = makeEffectGroup("support");
  for (let ring = 0; ring < 3; ring += 1) {
    const contactRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.16 + ring * 0.1, 0.014, 8, 48),
      new THREE.MeshBasicMaterial({
        color: "#765add",
        transparent: true,
        opacity: 0.58 - ring * 0.14,
        depthWrite: false,
      }),
    );
    contactRing.name = `Illustrative staff contact ring ${ring + 1}`;
    contactRing.position.set(1.18, -1.9, 0.1);
    contactRing.rotation.x = Math.PI / 2;
    contactRing.userData.supportPhase = ring * 0.3;
    supportEffect.add(contactRing);
  }

  const selectionHalo = new THREE.Box3Helper(new THREE.Box3(), "#765add");
  selectionHalo.name = "Selected equipment focus outline";
  selectionHalo.visible = false;
  root.add(selectionHalo);

  return {
    root,
    body,
    helmetAssembly,
    undercap,
    backpack,
    partGroups,
    leftArm: leftArmBuild.shoulder,
    rightArm: rightArmBuild.shoulder,
    leftElbow: leftArmBuild.elbow,
    rightElbow: rightArmBuild.elbow,
    leftLeg: leftLegBuild.leg,
    rightLeg: rightLegBuild.leg,
    leftKnee: leftLegBuild.knee,
    rightKnee: rightLegBuild.knee,
    staffGroup,
    testEffects,
    selectionHalo,
    authoredContainer: null,
    authoredRigs: new Map(),
  } satisfies SuitRig;
}

function nearestPartId(object: THREE.Object3D | null): SurfaceSuitPartId | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (typeof current.userData.partId === "string") {
      return current.userData.partId as SurfaceSuitPartId;
    }
    current = current.parent;
  }
  return null;
}

function isVisibleInHierarchy(object: THREE.Object3D, root: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function setPartVisible(
  rig: SuitRig,
  partId: SurfaceSuitPartId,
  visible: boolean,
) {
  for (const group of rig.partGroups.get(partId) ?? []) group.visible = visible;
}

function applyPantsStyle(root: THREE.Object3D, style: SurfaceSuitPantsStyle) {
  root.traverse((object) => {
    if (typeof object.userData.pantsStyle === "string") {
      object.visible = object.userData.pantsStyle === style;
    }
  });
}

function applyTailoringStyles(
  root: THREE.Object3D,
  torsoStyle: SurfaceSuitTorsoStyle,
  bootStyle: SurfaceSuitBootStyle,
) {
  root.traverse((object) => {
    if (typeof object.userData.torsoStyle === "string") {
      object.visible = object.userData.torsoStyle === torsoStyle;
    }
    if (typeof object.userData.bootStyle === "string") {
      object.visible = object.userData.bootStyle === bootStyle;
    }
  });
}

function applyConceptVariant(rig: SuitRig, conceptId: SurfaceSuitConceptId) {
  rig.root.traverse((object) => {
    const conceptVariant = object.userData.conceptVariant as
      | SurfaceSuitConceptId
      | undefined;
    if (conceptVariant) object.visible = conceptVariant === conceptId;
    if (object instanceof THREE.Mesh && object.userData.conceptBase === "eva") {
      object.visible = conceptId !== "vector";
    }
  });
  const showEvaArchitecture = conceptId !== "vector";
  rig.helmetAssembly.visible = showEvaArchitecture;
  rig.backpack.visible = showEvaArchitecture;
  rig.undercap.visible = showEvaArchitecture;
}

function applyTestMode(rig: SuitRig, testMode: SurfaceSuitTestMode) {
  for (const [mode, group] of rig.testEffects) group.visible = mode === testMode;
}

function applyPartTransforms(
  rig: SuitRig,
  exploded: boolean,
  helmetAttached: boolean,
) {
  for (const groups of rig.partGroups.values()) {
    for (const group of groups) {
      const data = group.userData.partTransform as PartTransformData | undefined;
      if (!data) continue;
      group.position.copy(data.basePosition);
      if (exploded) group.position.add(data.explodeOffset);
    }
  }

  const helmetBase = rig.helmetAssembly.userData.basePosition as THREE.Vector3;
  rig.helmetAssembly.position.copy(helmetBase);
  rig.helmetAssembly.rotation.set(0, 0, 0);
  if (!helmetAttached) {
    rig.helmetAssembly.position.add(vector(1.24, -0.12, 0.25));
    rig.helmetAssembly.rotation.set(0.08, -0.48, -0.09);
  }
  if (exploded) rig.helmetAssembly.position.y += 0.18;
  for (const authored of rig.authoredRigs.values()) {
    const helmet = authored.helmetAssembly;
    if (!helmet) continue;
    const authoredBase = helmet.userData.basePosition as THREE.Vector3 | undefined;
    const authoredRotation = helmet.userData.baseRotation as THREE.Euler | undefined;
    if (authoredBase) helmet.position.copy(authoredBase);
    if (authoredRotation) helmet.rotation.copy(authoredRotation);
    if (!helmetAttached) {
      helmet.position.add(vector(0.48, -0.04, 0.1));
      helmet.rotation.set(0.08, -0.48, -0.09);
    }
    if (exploded) helmet.position.y += 0.08;
  }
  // The wearer remains visible through the pressure visor for EVA concepts.
  // Concept visibility is applied separately so VECTOR can retain its open-head
  // Earth-research architecture when the assembly controls are used.
}

function applyAppearance(
  root: THREE.Object3D,
  palette: SurfaceSuitPalette,
  selectedPartId: string | null,
  cutaway: boolean,
  previewOnlySelectedPart: boolean,
) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const role = object.userData.materialRole as MaterialRole | undefined;
    if (!role) return;
    const internalPartId = nearestPartId(object);
    const selected = Boolean(
      internalPartId && partMatchesSelection(internalPartId, selectedPartId),
    );
    const cutawaySurface = Boolean(object.userData.cutawaySurface);
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const roleColor = colorForRole(role, palette);
      material.color.set(roleColor);
      const naturalOpacity =
        role === "visor" ? 0.58 : role === "sunVisor" ? 0.7 : 1;
      const opacity =
        selected && previewOnlySelectedPart
          ? Math.min(naturalOpacity, 0.38)
          : cutaway && cutawaySurface
            ? 0.16
            : naturalOpacity;
      material.opacity = opacity;
      material.transparent = opacity < 1;
      material.depthWrite = opacity >= 0.95;
      material.side = cutaway && cutawaySurface ? THREE.DoubleSide : THREE.FrontSide;

      if (role === "light") {
        material.emissive.set(roleColor);
        material.emissiveIntensity = selected ? 3.1 : 2.2;
      } else if (role === "haptic") {
        material.emissive.set(roleColor);
        material.emissiveIntensity = selected ? 1.1 : 0.28;
      } else if (selected) {
        material.emissive.set(palette.accent);
        material.emissiveIntensity = 0.34;
      } else {
        material.emissive.set("#000000");
        material.emissiveIntensity = 0;
      }
      material.needsUpdate = true;
    }
  });
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    if (
      !(
        object instanceof THREE.Mesh ||
        object instanceof THREE.Points ||
        object instanceof THREE.Line ||
        object instanceof THREE.LineSegments
      )
    ) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material.dispose();
  });
}

function updateCamera(camera: THREE.PerspectiveCamera, orbit: CameraOrbit) {
  const horizontal = Math.cos(orbit.pitch) * orbit.distance;
  camera.position.set(
    Math.sin(orbit.yaw) * horizontal,
    orbit.targetY + Math.sin(orbit.pitch) * orbit.distance,
    Math.cos(orbit.yaw) * horizontal,
  );
  camera.lookAt(0, orbit.targetY, 0);
}

function makeStarField() {
  const positions: number[] = [];
  for (let index = 0; index < 190; index += 1) {
    const theta = ((index * 2.399963) % (Math.PI * 2)) - Math.PI;
    const y = -4 + (((index * 67) % 191) / 190) * 8;
    const radius = 8.5 + ((index * 29) % 17) * 0.12;
    positions.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: "#8d78c8",
    size: 0.018,
    transparent: true,
    opacity: 0.2,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "Procedural background stars";
  return points;
}

const SURFACE_SUIT_PART_IDS = new Set<SurfaceSuitPartId>(
  Object.keys(SURFACE_SUIT_PART_LABELS) as SurfaceSuitPartId[],
);

function authoredGroupWithRole(
  root: THREE.Object3D,
  role: string,
): THREE.Object3D | null {
  const matches: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object.userData.rig_role === role) {
      matches.push(object);
    }
  });
  return matches[0] ?? null;
}

function authoredGroupWithProperty(
  root: THREE.Object3D,
  property: string,
  value: unknown,
): THREE.Object3D | null {
  const matches: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object.userData[property] === value) {
      matches.push(object);
    }
  });
  return matches[0] ?? null;
}

function installAuthoredSuits(rig: SuitRig, loadedScene: THREE.Group) {
  const container = new THREE.Group();
  container.name = "Blender-authored RIEVA missionwear";
  container.userData.assetKind = "blender-authored";
  container.add(loadedScene);

  const initialBounds = new THREE.Box3().setFromObject(loadedScene, true);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  const center = initialBounds.getCenter(new THREE.Vector3());
  const authoredScale = initialSize.y > 0 ? 4.38 / initialSize.y : 2.58;
  container.scale.setScalar(authoredScale);
  container.position.set(
    -center.x * authoredScale,
    -2.18 - initialBounds.min.y * authoredScale,
    -center.z * authoredScale,
  );
  container.userData.authoredScale = authoredScale;
  container.userData.basePosition = container.position.clone();

  loadedScene.traverse((object) => {
    const partId = object.userData.part_id;
    if (
      typeof partId === "string" &&
      SURFACE_SUIT_PART_IDS.has(partId as SurfaceSuitPartId)
    ) {
      const internalPartId = partId as SurfaceSuitPartId;
      object.userData.partId = internalPartId;
      const rawOffset = object.userData.explode_offset;
      const explodeOffset =
        Array.isArray(rawOffset) && rawOffset.length === 3
          ? new THREE.Vector3(
              Number(rawOffset[0]) || 0,
              Number(rawOffset[2]) || 0,
              -(Number(rawOffset[1]) || 0),
            )
          : new THREE.Vector3();
      object.userData.partTransform = {
        basePosition: object.position.clone(),
        explodeOffset,
      } satisfies PartTransformData;
      const groups = rig.partGroups.get(internalPartId) ?? [];
      groups.push(object);
      rig.partGroups.set(internalPartId, groups);
    }

    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => material.clone());
    } else {
      object.material = object.material.clone();
    }
  });

  for (const conceptId of ["selene", "areo", "vector"] as const) {
    const conceptRoot = authoredGroupWithProperty(
      loadedScene,
      "conceptVariant",
      conceptId,
    );
    if (!conceptRoot) continue;

    const body = authoredGroupWithRole(conceptRoot, "body");
    const leftArm = authoredGroupWithRole(conceptRoot, "arm_l");
    const rightArm = authoredGroupWithRole(conceptRoot, "arm_r");
    const leftElbow = authoredGroupWithRole(conceptRoot, "forearm_l");
    const rightElbow = authoredGroupWithRole(conceptRoot, "forearm_r");
    const leftLeg = authoredGroupWithRole(conceptRoot, "leg_l");
    const rightLeg = authoredGroupWithRole(conceptRoot, "leg_r");
    const leftKnee = authoredGroupWithRole(conceptRoot, "shin_l");
    const rightKnee = authoredGroupWithRole(conceptRoot, "shin_r");
    if (
      !body ||
      !leftArm ||
      !rightArm ||
      !leftElbow ||
      !rightElbow ||
      !leftLeg ||
      !rightLeg ||
      !leftKnee ||
      !rightKnee
    ) continue;

    const helmetAssembly = authoredGroupWithProperty(
      conceptRoot,
      "helmet_assembly",
      true,
    );
    if (helmetAssembly) {
      helmetAssembly.userData.basePosition = helmetAssembly.position.clone();
      helmetAssembly.userData.baseRotation = helmetAssembly.rotation.clone();
    }
    body.userData.baseY = body.position.y;
    rig.authoredRigs.set(conceptId, {
      root: conceptRoot,
      body,
      leftArm,
      rightArm,
      leftElbow,
      rightElbow,
      leftLeg,
      rightLeg,
      leftKnee,
      rightKnee,
      helmetAssembly,
    });
  }

  rig.body.visible = false;
  rig.authoredContainer = container;
  rig.root.add(container);
}

function selectedLabel(partId: string | null | undefined) {
  if (!partId) return "No suit part selected";
  if (partId in SURFACE_SUIT_PART_LABELS) {
    return SURFACE_SUIT_PART_LABELS[partId as SurfaceSuitPartId];
  }
  const internalPartId = (Object.keys(SURFACE_SUIT_PART_ALIASES) as SurfaceSuitPartId[])
    .find((candidate) => SURFACE_SUIT_PART_ALIASES[candidate] === partId);
  return internalPartId
    ? SURFACE_SUIT_PART_LABELS[internalPartId]
    : partId.replace(/-/g, " ");
}

const TEST_MODE_LABELS: Record<SurfaceSuitTestMode, string> = {
  none: "Test room idle",
  uv: "Illustrative optical / UV ray path — not a radiation analysis",
  dust: "Illustrative dust deflection — not validated particle dynamics",
  lighting: "Illustrative task-light cone — photometry not modeled",
  signal: "Illustrative antenna signal — RF propagation not modeled",
  haptic: "Illustrative haptic cue pulse — perception not modeled",
  support: "Illustrative staff contact — ground forces not calculated",
};

const CONCEPT_VIEW_LABELS: Record<SurfaceSuitConceptId, string> = {
  selene: "MAX lunar EVA concept · common pressure architecture with lunar-specific dust and lighting overlays",
  areo: "MALTE Mars EVA concept · asymmetric geology panels and abrasion overlays",
  vector: "BASTIAN Earth research garment · open head, no pressure enclosure, and no life-support backpack",
};

export function SurfaceSuitScene({
  conceptId = "selene",
  active = true,
  palette,
  bodyPreset = "standard",
  selectedPartId = null,
  previewOnlySelectedPart = false,
  helmetAttached = true,
  exploded = false,
  cutaway = false,
  walking = false,
  motionMode,
  testMode = "none",
  catEars = true,
  staff = false,
  assistModule = false,
  dustModule = true,
  haptics = false,
  shoulderCamera = false,
  tetherReel = true,
  sampleKit = true,
  pantsStyle = "contour",
  torsoStyle = "streamline",
  bootStyle = "traverse",
  onSelectPart,
  className = "",
}: SurfaceSuitSceneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rigRef = useRef<SuitRig | null>(null);
  const animationLoopRef = useRef<(() => void) | null>(null);
  const activeRef = useRef(active);
  const contextLostRef = useRef(false);
  const conceptIdRef = useRef<SurfaceSuitConceptId>(conceptId);
  const cameraOrbitRef = useRef<CameraOrbit>({
    yaw: 0,
    pitch: 0.08,
    distance: 6.8,
    targetY: 0,
  });
  const resolvedMotionMode = motionMode ?? (walking ? "walk" : "neutral");
  const motionModeRef = useRef<SurfaceSuitMotionMode>(resolvedMotionMode);
  const testModeRef = useRef<SurfaceSuitTestMode>(testMode);
  const selectedPartRef = useRef<string | null>(selectedPartId);
  const onSelectPartRef = useRef(onSelectPart);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [assetStatus, setAssetStatus] = useState<"loading" | "ready" | "fallback">(
    "loading",
  );
  const [cameraLabel, setCameraLabel] = useState("Front view");
  const [exportMessage, setExportMessage] = useState("");

  const resolvedPalette = useMemo<SurfaceSuitPalette>(
    () => ({
      ...DEFAULT_SURFACE_SUIT_PALETTE,
      ...palette,
      shell:
        palette?.shell ?? palette?.base ?? DEFAULT_SURFACE_SUIT_PALETTE.shell,
      secondaryShell:
        palette?.secondaryShell ??
        palette?.secondary ??
        DEFAULT_SURFACE_SUIT_PALETTE.secondaryShell,
      underlayer:
        palette?.underlayer ?? palette?.dark ?? DEFAULT_SURFACE_SUIT_PALETTE.underlayer,
      sunVisor:
        palette?.sunVisor ?? palette?.accent ?? DEFAULT_SURFACE_SUIT_PALETTE.sunVisor,
      metal:
        palette?.metal ?? palette?.secondary ?? DEFAULT_SURFACE_SUIT_PALETTE.metal,
      light:
        palette?.light ?? palette?.accent ?? DEFAULT_SURFACE_SUIT_PALETTE.light,
      dust:
        palette?.dust ?? palette?.secondary ?? DEFAULT_SURFACE_SUIT_PALETTE.dust,
      assist:
        palette?.assist ?? palette?.secondary ?? DEFAULT_SURFACE_SUIT_PALETTE.assist,
      haptic:
        palette?.haptic ?? palette?.accent ?? DEFAULT_SURFACE_SUIT_PALETTE.haptic,
    }),
    [palette],
  );

  // The Blender asset arrives asynchronously. Keep the latest configurator
  // state in one stable ref so a fast user interaction during loading cannot
  // be overwritten by the values from the first render.
  const assetConfigurationRef = useRef({
    bodyPreset,
    pantsStyle,
    torsoStyle,
    bootStyle,
    catEars,
    staff,
    assistModule,
    dustModule,
    haptics,
    shoulderCamera,
    tetherReel,
    sampleKit,
    exploded,
    helmetAttached,
    resolvedPalette,
    cutaway,
    previewOnlySelectedPart,
  });

  useEffect(() => {
    assetConfigurationRef.current = {
      bodyPreset,
      pantsStyle,
      torsoStyle,
      bootStyle,
      catEars,
      staff,
      assistModule,
      dustModule,
      haptics,
      shoulderCamera,
      tetherReel,
      sampleKit,
      exploded,
      helmetAttached,
      resolvedPalette,
      cutaway,
      previewOnlySelectedPart,
    };
  }, [
    assistModule,
    bodyPreset,
    bootStyle,
    catEars,
    cutaway,
    dustModule,
    exploded,
    haptics,
    helmetAttached,
    pantsStyle,
    previewOnlySelectedPart,
    resolvedPalette,
    sampleKit,
    shoulderCamera,
    staff,
    tetherReel,
    torsoStyle,
  ]);

  useEffect(() => {
    motionModeRef.current = resolvedMotionMode;
  }, [resolvedMotionMode]);

  useEffect(() => {
    conceptIdRef.current = conceptId;
    const rig = rigRef.current;
    if (rig) {
      applyPantsStyle(rig.root, pantsStyle);
      applyTailoringStyles(rig.root, torsoStyle, bootStyle);
      applyConceptVariant(rig, conceptId);
    }
  }, [bootStyle, conceptId, pantsStyle, torsoStyle]);

  useEffect(() => {
    testModeRef.current = testMode;
    const rig = rigRef.current;
    if (rig) applyTestMode(rig, testMode);
  }, [testMode]);

  useEffect(() => {
    selectedPartRef.current = selectedPartId;
  }, [selectedPartId]);

  useEffect(() => {
    onSelectPartRef.current = onSelectPart;
  }, [onSelectPart]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let disposed = false;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
    } catch {
      const failureTimer = window.setTimeout(() => {
        setWebglError(
          "The interactive suit preview could not start because WebGL is unavailable in this browser.",
        );
      }, 0);
      return () => window.clearTimeout(failureTimer);
    }

    rendererRef.current = renderer;
    renderer.setPixelRatio(clamp(window.devicePixelRatio || 1, 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "surface-suit-scene__canvas";
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive three-dimensional Blender-authored missionwear. Drag or touch to rotate, use the wheel or labeled buttons to zoom, and select visible equipment for details.",
    );
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "grab";
    viewport.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color("#edf0f8");
    scene.fog = new THREE.Fog("#edf0f8", 8.4, 15);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 40);
    cameraRef.current = camera;
    updateCamera(camera, cameraOrbitRef.current);

    const hemisphere = new THREE.HemisphereLight("#ffffff", "#a9a0ca", 1.9);
    hemisphere.name = "Soft environment light";
    scene.add(hemisphere);
    const keyLight = new THREE.DirectionalLight("#ffffff", 3.55);
    keyLight.name = "Front key light";
    keyLight.position.set(3.6, 5.5, 5.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 14;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight("#b17cff", 1.35);
    rimLight.name = "Purple rear rim light";
    rimLight.position.set(-4, 2.5, -5);
    scene.add(rimLight);

    const starField = makeStarField();
    scene.add(starField);
    const grid = new THREE.GridHelper(9, 22, "#9889cf", "#c8c4dc");
    grid.name = "Suit inspection floor grid";
    grid.position.y = -2.28;
    const gridMaterials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.34;
    }
    scene.add(grid);
    const platform = addCylinder(
      scene,
      "Rounded inspection platform",
      1.23,
      1.3,
      0.1,
      "platform",
      vector(0, -2.24, 0),
    );
    platform.receiveShadow = true;
    platform.castShadow = false;
    addTorus(
      scene,
      "Inspection platform cyan rim",
      1.17,
      0.018,
      "accent",
      vector(0, -2.18, 0),
      euler(Math.PI / 2),
    );

    const rig = buildSuit();
    rigRef.current = rig;
    scene.add(rig.root);
    applyConceptVariant(rig, conceptIdRef.current);
    applyTestMode(rig, testModeRef.current);

    const authoredLoader = new GLTFLoader();
    authoredLoader.load(
      "/models/rieva-missionwear.glb",
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        try {
          installAuthoredSuits(rig, gltf.scene);
          const current = assetConfigurationRef.current;
          if (rig.authoredContainer) {
            const scalar =
              (rig.authoredContainer.userData.authoredScale as number | undefined) ?? 2.58;
            rig.authoredContainer.scale.set(
              scalar * BODY_SCALES[current.bodyPreset].x,
              scalar * BODY_SCALES[current.bodyPreset].y,
              scalar * BODY_SCALES[current.bodyPreset].z,
            );
          }
          applyPantsStyle(rig.root, current.pantsStyle);
          applyTailoringStyles(rig.root, current.torsoStyle, current.bootStyle);
          setPartVisible(rig, "helmet-cat-ear-pods", current.catEars || selectedPartRef.current === "cat-ear-pods");
          setPartVisible(rig, "walking-staff", current.staff || selectedPartRef.current === "walking-staff");
          setPartVisible(
            rig,
            "assistive-lower-body-module",
            current.assistModule || selectedPartRef.current === "assist-module",
          );
          setPartVisible(rig, "dust-gaiter-left", current.dustModule || selectedPartRef.current === "dust-module");
          setPartVisible(rig, "dust-gaiter-right", current.dustModule || selectedPartRef.current === "dust-module");
          setPartVisible(rig, "haptic-module", current.haptics || selectedPartRef.current === "haptic-module");
          setPartVisible(
            rig,
            "shoulder-camera",
            current.shoulderCamera || selectedPartRef.current === "shoulder-camera",
          );
          setPartVisible(rig, "tether-reel", current.tetherReel || selectedPartRef.current === "tether-reel");
          setPartVisible(rig, "sample-kit", current.sampleKit || selectedPartRef.current === "sample-kit");
          applyPartTransforms(rig, current.exploded, current.helmetAttached);
          applyConceptVariant(rig, conceptIdRef.current);
          applyAppearance(
            rig.root,
            current.resolvedPalette,
            selectedPartRef.current,
            current.cutaway,
            current.previewOnlySelectedPart,
          );
          setAssetStatus("ready");
        } catch (error) {
          console.error("Unable to install Blender missionwear asset", error);
          setAssetStatus("fallback");
          rig.body.visible = true;
        }
      },
      undefined,
      (error) => {
        console.error("Unable to load Blender missionwear asset", error);
        if (!disposed) setAssetStatus("fallback");
      },
    );

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerId: number | null = null;
    let pointerOrigin = { x: 0, y: 0 };
    let pointerPrevious = { x: 0, y: 0 };
    let pointerMoved = false;

    const selectAt = (clientX: number, clientY: number) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      pointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(rig.root, true);
      let partId: SurfaceSuitPartId | null = null;
      for (const hit of hits) {
        if (!isVisibleInHierarchy(hit.object, rig.root)) continue;
        partId = nearestPartId(hit.object);
        if (partId) break;
      }
      if (partId) {
        onSelectPartRef.current?.(SURFACE_SUIT_PART_ALIASES[partId]);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerId = event.pointerId;
      pointerOrigin = { x: event.clientX, y: event.clientY };
      pointerPrevious = pointerOrigin;
      pointerMoved = false;
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "grabbing";
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      const deltaX = event.clientX - pointerPrevious.x;
      const deltaY = event.clientY - pointerPrevious.y;
      pointerPrevious = { x: event.clientX, y: event.clientY };
      if (
        Math.hypot(
          event.clientX - pointerOrigin.x,
          event.clientY - pointerOrigin.y,
        ) > 4
      ) {
        pointerMoved = true;
      }
      const orbit = cameraOrbitRef.current;
      orbit.yaw -= deltaX * 0.007;
      orbit.pitch = clamp(orbit.pitch + deltaY * 0.006, -0.28, 0.72);
      updateCamera(camera, orbit);
    };

    const endPointer = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
      if (!pointerMoved) selectAt(event.clientX, event.clientY);
      pointerId = null;
      renderer.domElement.style.cursor = "grab";
      if (pointerMoved) setCameraLabel("Custom view");
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const orbit = cameraOrbitRef.current;
      orbit.distance = clamp(
        orbit.distance * Math.exp(event.deltaY * 0.001),
        4.7,
        10.5,
      );
      updateCamera(camera, orbit);
      setCameraLabel("Custom view");
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLostRef.current = true;
      renderer.setAnimationLoop(null);
      setWebglError(
        "The WebGL context was lost. Reload the page to restart the interactive suit preview.",
      );
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", endPointer);
    renderer.domElement.addEventListener("pointercancel", endPointer);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);

    const resize = () => {
      const width = Math.max(1, viewport.clientWidth);
      const height = Math.max(1, viewport.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(viewport);
    resize();

    const clock = new THREE.Clock();
    const renderFrame = () => {
      const elapsed = clock.getElapsedTime();
      const activeMotion = motionModeRef.current;
      const locomotion = activeMotion === "walk" || activeMotion === "run";
      const frequency = activeMotion === "run" ? 6.2 : 3.1;
      const stride = activeMotion === "run" ? 0.7 : activeMotion === "walk" ? 0.42 : 0;
      const swing = Math.sin(elapsed * frequency) * stride;
      const oppositeSwing = Math.sin(elapsed * frequency + Math.PI) * stride;
      const kneeDepth = activeMotion === "run" ? 0.58 : 0.34;
      const kneeFlexLeft = locomotion
        ? Math.max(0, -Math.sin(elapsed * frequency)) * kneeDepth
        : activeMotion === "jump"
          ? 0.68
          : 0;
      const kneeFlexRight = locomotion
        ? Math.max(0, Math.sin(elapsed * frequency)) * kneeDepth
        : activeMotion === "jump"
          ? 0.68
          : 0;
      const jumpLift =
        activeMotion === "jump"
          ? Math.max(0, Math.sin(elapsed * 2.15)) * 0.52
          : 0;
      const leftLegTarget = activeMotion === "jump" ? -0.24 : swing;
      const rightLegTarget = activeMotion === "jump" ? -0.24 : oppositeSwing;
      rig.rightLeg.rotation.x = THREE.MathUtils.lerp(
        rig.rightLeg.rotation.x,
        rightLegTarget,
        0.14,
      );
      rig.leftLeg.rotation.x = THREE.MathUtils.lerp(
        rig.leftLeg.rotation.x,
        leftLegTarget,
        0.14,
      );
      rig.leftArm.rotation.x = THREE.MathUtils.lerp(
        rig.leftArm.rotation.x,
        activeMotion === "jump" ? -1.12 : oppositeSwing * 0.78,
        0.14,
      );
      rig.rightArm.rotation.x = THREE.MathUtils.lerp(
        rig.rightArm.rotation.x,
        activeMotion === "jump" ? -1.12 : swing * 0.78,
        0.14,
      );
      rig.leftKnee.rotation.x = THREE.MathUtils.lerp(
        rig.leftKnee.rotation.x,
        kneeFlexLeft,
        0.14,
      );
      rig.rightKnee.rotation.x = THREE.MathUtils.lerp(
        rig.rightKnee.rotation.x,
        kneeFlexRight,
        0.14,
      );
      rig.leftElbow.rotation.x = THREE.MathUtils.lerp(
        rig.leftElbow.rotation.x,
        activeMotion === "jump" ? 0.34 : locomotion ? 0.18 : 0,
        0.12,
      );
      rig.rightElbow.rotation.x = THREE.MathUtils.lerp(
        rig.rightElbow.rotation.x,
        activeMotion === "jump" ? 0.34 : locomotion ? 0.18 : 0,
        0.12,
      );
      const bodyBaseY =
        typeof rig.body.userData.baseY === "number" ? rig.body.userData.baseY : 0;
      rig.body.position.y = THREE.MathUtils.lerp(
        rig.body.position.y,
        bodyBaseY +
          (locomotion
            ? Math.abs(Math.sin(elapsed * frequency)) * (activeMotion === "run" ? 0.06 : 0.035)
            : jumpLift),
        0.16,
      );
      rig.body.rotation.x = THREE.MathUtils.lerp(
        rig.body.rotation.x,
        activeMotion === "run" ? 0.11 : 0,
        0.12,
      );

      const authored = rig.authoredRigs.get(conceptIdRef.current);
      if (authored) {
        authored.rightLeg.rotation.x = THREE.MathUtils.lerp(
          authored.rightLeg.rotation.x,
          rightLegTarget,
          0.14,
        );
        authored.leftLeg.rotation.x = THREE.MathUtils.lerp(
          authored.leftLeg.rotation.x,
          leftLegTarget,
          0.14,
        );
        authored.leftArm.rotation.x = THREE.MathUtils.lerp(
          authored.leftArm.rotation.x,
          activeMotion === "jump" ? -1.02 : oppositeSwing * 0.7,
          0.14,
        );
        authored.rightArm.rotation.x = THREE.MathUtils.lerp(
          authored.rightArm.rotation.x,
          activeMotion === "jump" ? -1.02 : swing * 0.7,
          0.14,
        );
        authored.leftKnee.rotation.x = THREE.MathUtils.lerp(
          authored.leftKnee.rotation.x,
          kneeFlexLeft,
          0.14,
        );
        authored.rightKnee.rotation.x = THREE.MathUtils.lerp(
          authored.rightKnee.rotation.x,
          kneeFlexRight,
          0.14,
        );
        authored.leftElbow.rotation.x = THREE.MathUtils.lerp(
          authored.leftElbow.rotation.x,
          activeMotion === "jump" ? 0.3 : locomotion ? 0.16 : 0,
          0.12,
        );
        authored.rightElbow.rotation.x = THREE.MathUtils.lerp(
          authored.rightElbow.rotation.x,
          activeMotion === "jump" ? 0.3 : locomotion ? 0.16 : 0,
          0.12,
        );
        const authoredScale =
          (rig.authoredContainer?.userData.authoredScale as number | undefined) ?? 2.58;
        const authoredBaseY =
          typeof authored.body.userData.baseY === "number"
            ? authored.body.userData.baseY
            : 0;
        authored.body.position.y = THREE.MathUtils.lerp(
          authored.body.position.y,
          authoredBaseY +
            (locomotion
              ? Math.abs(Math.sin(elapsed * frequency)) *
                (activeMotion === "run" ? 0.055 : 0.032) /
                authoredScale
              : jumpLift / authoredScale),
          0.16,
        );
        authored.body.rotation.x = THREE.MathUtils.lerp(
          authored.body.rotation.x,
          activeMotion === "run" ? 0.095 : 0,
          0.12,
        );
      }

      const selectedGroups: THREE.Object3D[] = [];
      const selected = selectedPartRef.current;
      if (selected) {
        for (const [internalId, groups] of rig.partGroups) {
          if (partMatchesSelection(internalId, selected)) {
            selectedGroups.push(...groups.filter((group) => isVisibleInHierarchy(group, rig.root)));
          }
        }
      }
      if (selectedGroups.length > 0) {
        const bounds = new THREE.Box3();
        for (const group of selectedGroups) bounds.expandByObject(group, true);
        if (!bounds.isEmpty()) {
          rig.selectionHalo.box.copy(bounds).expandByScalar(0.045);
          rig.selectionHalo.visible = true;
          const haloMaterials = Array.isArray(rig.selectionHalo.material)
            ? rig.selectionHalo.material
            : [rig.selectionHalo.material];
          for (const haloMaterial of haloMaterials) {
            haloMaterial.transparent = true;
            haloMaterial.opacity = 0.38 + Math.sin(elapsed * 4.2) * 0.16;
          }
        }
        const pulse = 0.28 + (Math.sin(elapsed * 4.2) + 1) * 0.24;
        for (const group of selectedGroups) {
          group.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            const role = object.userData.materialRole as MaterialRole | undefined;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) {
              if (!(material instanceof THREE.MeshStandardMaterial)) continue;
              material.emissiveIntensity = role === "light" ? 2.7 + pulse : role === "haptic" ? 0.7 + pulse : pulse;
            }
          });
        }
      } else {
        rig.selectionHalo.visible = false;
      }

      const activeTest = testModeRef.current;
      const effect = activeTest === "none" ? undefined : rig.testEffects.get(activeTest);
      if (effect) {
        effect.traverse((object) => {
          if (object instanceof THREE.Line) {
            const material = object.material;
            material.opacity = 0.55 + (Math.sin(elapsed * 5.5) + 1) * 0.16;
          }
          if (!(object instanceof THREE.Mesh)) return;
          const phase =
            (object.userData.signalPhase ?? object.userData.hapticPhase ?? object.userData.supportPhase ?? 0) as number;
          const cycle = (elapsed * (activeTest === "haptic" ? 1.9 : 1.25) + phase) % 1;
          if (activeTest === "signal" || activeTest === "haptic" || activeTest === "support") {
            const scale = 0.86 + cycle * 0.38;
            object.scale.setScalar(scale);
            if (object.material instanceof THREE.MeshBasicMaterial) {
              object.material.opacity = Math.max(0.08, 0.58 * (1 - cycle));
            }
          } else if (activeTest === "lighting" && object.material instanceof THREE.MeshBasicMaterial) {
            object.material.opacity = 0.09 + (Math.sin(elapsed * 3.4) + 1) * 0.025;
          }
        });
        if (activeTest === "dust") {
          effect.rotation.y = Math.sin(elapsed * 1.7) * 0.08;
          effect.position.y = (elapsed * 0.12) % 0.18;
        }
      }
      renderer.render(scene, camera);
    };
    animationLoopRef.current = renderFrame;
    if (activeRef.current) renderer.setAnimationLoop(renderFrame);
    else renderer.render(scene, camera);

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", endPointer);
      renderer.domElement.removeEventListener("pointercancel", endPointer);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement.parentElement === viewport) {
        viewport.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      rigRef.current = null;
      animationLoopRef.current = null;
      contextLostRef.current = false;
    };
  }, []);

  useEffect(() => {
    activeRef.current = active;
    const renderer = rendererRef.current;
    const renderFrame = animationLoopRef.current;
    if (!renderer || !renderFrame || contextLostRef.current) return;
    if (active) renderer.setAnimationLoop(renderFrame);
    else {
      renderer.setAnimationLoop(null);
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (scene && camera) renderer.render(scene, camera);
    }
  }, [active]);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    rig.body.scale.copy(BODY_SCALES[bodyPreset]);
    rig.body.userData.baseY = BODY_BASE_Y[bodyPreset];
    rig.body.position.y = BODY_BASE_Y[bodyPreset];
    if (rig.authoredContainer) {
      const scalar =
        (rig.authoredContainer.userData.authoredScale as number | undefined) ?? 2.58;
      rig.authoredContainer.scale.set(
        scalar * BODY_SCALES[bodyPreset].x,
        scalar * BODY_SCALES[bodyPreset].y,
        scalar * BODY_SCALES[bodyPreset].z,
      );
      const basePosition = rig.authoredContainer.userData.basePosition as
        | THREE.Vector3
        | undefined;
      if (basePosition) rig.authoredContainer.position.copy(basePosition);
    }
  }, [bodyPreset]);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    applyPartTransforms(rig, exploded, helmetAttached);
  }, [exploded, helmetAttached]);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    setPartVisible(rig, "helmet-cat-ear-pods", catEars || selectedPartId === "cat-ear-pods");
    setPartVisible(rig, "walking-staff", staff || selectedPartId === "walking-staff");
    setPartVisible(
      rig,
      "assistive-lower-body-module",
      assistModule || selectedPartId === "assist-module",
    );
    const showDust = dustModule || selectedPartId === "dust-module";
    setPartVisible(rig, "dust-gaiter-left", showDust);
    setPartVisible(rig, "dust-gaiter-right", showDust);
    setPartVisible(rig, "haptic-module", haptics || selectedPartId === "haptic-module");
    setPartVisible(
      rig,
      "shoulder-camera",
      shoulderCamera || selectedPartId === "shoulder-camera",
    );
    setPartVisible(rig, "tether-reel", tetherReel || selectedPartId === "tether-reel");
    setPartVisible(rig, "sample-kit", sampleKit || selectedPartId === "sample-kit");
    applyPantsStyle(rig.root, pantsStyle);
    applyTailoringStyles(rig.root, torsoStyle, bootStyle);
    // Style and accessory toggles may reveal meshes; reassert the selected
    // concept last so VECTOR never regains pressure-suit hardware.
    applyConceptVariant(rig, conceptIdRef.current);
  }, [
    assistModule,
    bootStyle,
    catEars,
    dustModule,
    haptics,
    pantsStyle,
    selectedPartId,
    sampleKit,
    shoulderCamera,
    staff,
    tetherReel,
    torsoStyle,
  ]);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    applyAppearance(
      rig.root,
      resolvedPalette,
      selectedPartId,
      cutaway,
      previewOnlySelectedPart,
    );
  }, [cutaway, previewOnlySelectedPart, resolvedPalette, selectedPartId]);

  const setCameraPreset = useCallback(
    (preset: "front" | "back" | "side" | "reset") => {
      const camera = cameraRef.current;
      if (!camera) return;
      const current = cameraOrbitRef.current;
      const next: CameraOrbit =
        preset === "reset"
          ? { yaw: 0, pitch: 0.08, distance: 6.8, targetY: 0 }
          : {
              ...current,
              yaw: preset === "back" ? Math.PI : preset === "side" ? Math.PI / 2 : 0,
              pitch: 0.08,
            };
      cameraOrbitRef.current = next;
      updateCamera(camera, next);
      setCameraLabel(
        preset === "back"
          ? "Back view"
          : preset === "side"
            ? "Side view"
            : "Front view",
      );
    },
    [],
  );

  const adjustZoom = useCallback((direction: "in" | "out") => {
    const camera = cameraRef.current;
    if (!camera) return;
    const orbit = cameraOrbitRef.current;
    orbit.distance = clamp(
      orbit.distance * (direction === "in" ? 0.84 : 1.19),
      4.7,
      10.5,
    );
    updateCamera(camera, orbit);
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (renderer && scene) renderer.render(scene, camera);
    setCameraLabel(`Custom view · ${direction === "in" ? "zoomed in" : "zoomed out"}`);
  }, []);

  const exportPng = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    try {
      renderer.render(scene, camera);
      const link = document.createElement("a");
      link.download = "rieva-surface-suit.png";
      link.href = renderer.domElement.toDataURL("image/png");
      link.click();
      setExportMessage("PNG snapshot exported.");
    } catch {
      setExportMessage("PNG export was unavailable in this browser.");
    }
  }, []);

  return (
    <section
      className={`surface-suit-scene ${className}`.trim()}
      aria-label="Interactive Blender-authored surface suit"
    >
      <div className="surface-suit-scene__toolbar">
        <div
          className="surface-suit-scene__camera-controls"
          role="group"
          aria-label="Suit camera views"
        >
          <button
            type="button"
            className="surface-suit-scene__camera-button"
            onClick={() => setCameraPreset("front")}
            disabled={Boolean(webglError)}
          >
            Front
          </button>
          <button
            type="button"
            className="surface-suit-scene__camera-button"
            onClick={() => setCameraPreset("back")}
            disabled={Boolean(webglError)}
          >
            Back
          </button>
          <button
            type="button"
            className="surface-suit-scene__camera-button"
            onClick={() => setCameraPreset("side")}
            disabled={Boolean(webglError)}
          >
            Side
          </button>
          <button
            type="button"
            className="surface-suit-scene__camera-button"
            onClick={() => setCameraPreset("reset")}
            disabled={Boolean(webglError)}
          >
            Reset
          </button>
          <button
            type="button"
            className="surface-suit-scene__camera-button"
            onClick={() => adjustZoom("in")}
            disabled={Boolean(webglError)}
            aria-label="Zoom in on missionwear model"
          >
            Zoom +
          </button>
          <button
            type="button"
            className="surface-suit-scene__camera-button"
            onClick={() => adjustZoom("out")}
            disabled={Boolean(webglError)}
            aria-label="Zoom out from missionwear model"
          >
            Zoom −
          </button>
        </div>
        <button
          type="button"
          className="surface-suit-scene__export-button"
          onClick={exportPng}
          disabled={Boolean(webglError)}
        >
          Export PNG
        </button>
      </div>

      <div
        className="surface-suit-scene__viewport"
        style={{
          position: "relative",
          width: "100%",
          minHeight: "540px",
          overflow: "hidden",
        }}
      >
        <div
          ref={viewportRef}
          className="surface-suit-scene__canvas-host"
          style={{ position: "absolute", inset: 0 }}
          aria-hidden={Boolean(webglError)}
        />
        {webglError ? (
          <div
            className="surface-suit-scene__fallback"
            role="img"
            aria-label="Three-dimensional suit preview unavailable"
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              alignContent: "center",
              justifyItems: "center",
              padding: "2rem",
              textAlign: "center",
            }}
          >
            <p className="surface-suit-scene__fallback-title">
              3D preview unavailable
            </p>
            <p className="surface-suit-scene__fallback-copy">{webglError}</p>
            <p className="surface-suit-scene__fallback-detail">
              The configuration, equipment inspector, evidence boundaries, and
              mission compatibility checks remain available below.
            </p>
          </div>
        ) : null}
        {!webglError && assetStatus === "loading" ? (
          <div className="surface-suit-scene__asset-loading" role="status">
            <span aria-hidden="true" />
            Preparing Blender missionwear…
          </div>
        ) : null}
      </div>

      <div className="surface-suit-scene__status">
        <p className="surface-suit-scene__camera-status">{cameraLabel}</p>
        <p className="surface-suit-scene__selection" aria-live="polite">
          {selectedLabel(selectedPartId)}
        </p>
        <p className="surface-suit-scene__walking-note">
          {CONCEPT_VIEW_LABELS[conceptId]}
        </p>
        {assetStatus === "ready" ? (
          <p className="surface-suit-scene__walking-note">
            Blender-authored anatomical mesh · interactive equipment hierarchy
          </p>
        ) : assetStatus === "fallback" ? (
          <p className="surface-suit-scene__walking-note" role="status">
            Blender asset unavailable; showing the lighter procedural fallback.
          </p>
        ) : null}
        {resolvedMotionMode !== "neutral" ? (
          <p className="surface-suit-scene__walking-note">
            Illustrative {resolvedMotionMode} preview — not a biomechanical simulation.
          </p>
        ) : null}
        {testMode !== "none" ? (
          <p className="surface-suit-scene__walking-note" aria-live="polite">
            {TEST_MODE_LABELS[testMode]}
          </p>
        ) : null}
        <p className="surface-suit-scene__export-status" aria-live="polite">
          {exportMessage}
        </p>
      </div>
    </section>
  );
}

export default SurfaceSuitScene;
