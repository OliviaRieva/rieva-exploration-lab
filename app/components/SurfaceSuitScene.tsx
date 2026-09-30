"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

export type SurfaceSuitBodyPreset = "compact" | "standard" | "tall";
export type SurfaceSuitPantsStyle = "contour" | "field" | "mobility";

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
  | "haptic-module";

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
  palette?: SurfaceSuitPaletteInput;
  bodyPreset?: SurfaceSuitBodyPreset;
  selectedPartId?: string | null;
  helmetAttached?: boolean;
  exploded?: boolean;
  cutaway?: boolean;
  walking?: boolean;
  catEars?: boolean;
  staff?: boolean;
  assistModule?: boolean;
  dustModule?: boolean;
  haptics?: boolean;
  pantsStyle?: SurfaceSuitPantsStyle;
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
};

type MaterialRole =
  | keyof SurfaceSuitPalette
  | "platform"
  | "seam";

interface PartTransformData {
  basePosition: THREE.Vector3;
  explodeOffset: THREE.Vector3;
}

interface SuitRig {
  root: THREE.Group;
  body: THREE.Group;
  helmetAssembly: THREE.Group;
  undercap: THREE.Object3D;
  partGroups: Map<SurfaceSuitPartId, THREE.Group[]>;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  staffGroup: THREE.Group;
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
      role === "underlayer" || role === "seam"
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
  registry: Map<SurfaceSuitPartId, THREE.Group[]>,
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
  if (options.position) mesh.position.copy(options.position);
  if (options.rotation) mesh.rotation.copy(options.rotation);
  if (options.scale) mesh.scale.copy(options.scale);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
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

function buildArm(
  body: THREE.Group,
  registry: Map<SurfaceSuitPartId, THREE.Group[]>,
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
  for (let finger = 0; finger < 3; finger += 1) {
    addCapsule(
      glove,
      `${sideName} glove finger ${finger + 1}`,
      0.032,
      0.11,
      "shell",
      vector((finger - 1) * 0.058, -0.19, 0.035),
      vector(0.9, 1, 0.9),
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
  registry: Map<SurfaceSuitPartId, THREE.Group[]>,
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

function buildSuit() {
  const partGroups = new Map<SurfaceSuitPartId, THREE.Group[]>();
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
    "Tapered torso hard upper",
    new THREE.SphereGeometry(0.72, 42, 28),
    "shell",
    {
      scale: vector(1, 1.1, 0.62),
      position: vector(0, 0.09, 0),
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
    "Layered chest impact panel",
    new THREE.SphereGeometry(0.51, 36, 22),
    "secondaryShell",
    {
      scale: vector(1, 0.78, 0.18),
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
    "Rounded helmet pressure shell surface",
    new THREE.SphereGeometry(0.54, 48, 32),
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

  const undercap = addMesh(
    body,
    "Visible helmet undercap",
    new THREE.SphereGeometry(0.34, 28, 20),
    "underlayer",
    { position: vector(0, 1.84, 0), scale: vector(0.92, 1.05, 0.94) },
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

  const leftArmBuild = buildArm(body, partGroups, -1);
  const rightArmBuild = buildArm(body, partGroups, 1);
  const leftLegBuild = buildLeg(body, partGroups, -1);
  const rightLegBuild = buildLeg(body, partGroups, 1);

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
    rightArmBuild.glove,
    partGroups,
    "walking-staff",
    "Optional walking staff",
    vector(0.18, -0.1, 0.08),
    vector(0.2, -0.08, 0.1),
  );
  staffGroup.rotation.z = -0.08;
  addCylinder(
    staffGroup,
    "Walking staff tapered shaft",
    0.028,
    0.045,
    2.45,
    "assist",
    vector(0, -1.04, 0),
  );
  addTorus(
    staffGroup,
    "Walking staff rounded grip",
    0.13,
    0.035,
    "underlayer",
    vector(0.07, 0.17, 0),
    euler(0, Math.PI / 2, 0),
    vector(1, 0.68, 1),
    Math.PI * 1.35,
  );
  addMesh(
    staffGroup,
    "Walking staff terrain tip",
    new THREE.ConeGeometry(0.07, 0.2, 18),
    "metal",
    { position: vector(0, -2.32, 0), rotation: euler(0, 0, Math.PI) },
  );

  return {
    root,
    body,
    helmetAssembly,
    undercap,
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
  rig.undercap.visible = !helmetAttached;
}

function applyAppearance(
  root: THREE.Object3D,
  palette: SurfaceSuitPalette,
  selectedPartId: string | null,
  cutaway: boolean,
) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const role = object.userData.materialRole as MaterialRole | undefined;
    if (!role) return;
    const internalPartId = nearestPartId(object);
    const selected = Boolean(
      internalPartId &&
        (internalPartId === selectedPartId ||
          SURFACE_SUIT_PART_ALIASES[internalPartId] === selectedPartId),
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
      const opacity = cutaway && cutawaySurface ? 0.16 : naturalOpacity;
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
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
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

export function SurfaceSuitScene({
  palette,
  bodyPreset = "standard",
  selectedPartId = null,
  helmetAttached = true,
  exploded = false,
  cutaway = false,
  walking = false,
  catEars = true,
  staff = false,
  assistModule = false,
  dustModule = true,
  haptics = false,
  pantsStyle = "contour",
  onSelectPart,
  className = "",
}: SurfaceSuitSceneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rigRef = useRef<SuitRig | null>(null);
  const cameraOrbitRef = useRef<CameraOrbit>({
    yaw: 0,
    pitch: 0.08,
    distance: 6.8,
    targetY: 0,
  });
  const walkingRef = useRef(walking);
  const onSelectPartRef = useRef(onSelectPart);
  const [webglError, setWebglError] = useState<string | null>(null);
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

  useEffect(() => {
    walkingRef.current = walking;
  }, [walking]);

  useEffect(() => {
    onSelectPartRef.current = onSelectPart;
  }, [onSelectPart]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

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
      "Interactive three-dimensional procedural surface suit. Drag to rotate, use the wheel to zoom, or use the camera buttons.",
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
    renderer.setAnimationLoop(() => {
      const elapsed = clock.getElapsedTime();
      const targetBlend = walkingRef.current ? 1 : 0;
      const swing = Math.sin(elapsed * 3.1) * 0.42 * targetBlend;
      const oppositeSwing = Math.sin(elapsed * 3.1 + Math.PI) * 0.42 * targetBlend;
      const kneeFlexLeft = Math.max(0, -Math.sin(elapsed * 3.1)) * 0.34 * targetBlend;
      const kneeFlexRight = Math.max(0, Math.sin(elapsed * 3.1)) * 0.34 * targetBlend;
      rig.leftLeg.rotation.x = THREE.MathUtils.lerp(rig.leftLeg.rotation.x, swing, 0.14);
      rig.rightLeg.rotation.x = THREE.MathUtils.lerp(
        rig.rightLeg.rotation.x,
        oppositeSwing,
        0.14,
      );
      rig.leftArm.rotation.x = THREE.MathUtils.lerp(
        rig.leftArm.rotation.x,
        oppositeSwing * 0.78,
        0.14,
      );
      rig.rightArm.rotation.x = THREE.MathUtils.lerp(
        rig.rightArm.rotation.x,
        swing * 0.78,
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
        walkingRef.current ? 0.18 : 0,
        0.12,
      );
      rig.rightElbow.rotation.x = THREE.MathUtils.lerp(
        rig.rightElbow.rotation.x,
        walkingRef.current ? 0.18 : 0,
        0.12,
      );
      const bodyBaseY =
        typeof rig.body.userData.baseY === "number" ? rig.body.userData.baseY : 0;
      rig.body.position.y = THREE.MathUtils.lerp(
        rig.body.position.y,
        bodyBaseY +
          (walkingRef.current ? Math.abs(Math.sin(elapsed * 3.1)) * 0.035 : 0),
        0.16,
      );
      renderer.render(scene, camera);
    });

    return () => {
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
    };
  }, []);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    rig.body.scale.copy(BODY_SCALES[bodyPreset]);
    rig.body.userData.baseY = BODY_BASE_Y[bodyPreset];
    rig.body.position.y = BODY_BASE_Y[bodyPreset];
  }, [bodyPreset]);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    applyPartTransforms(rig, exploded, helmetAttached);
  }, [exploded, helmetAttached]);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    setPartVisible(rig, "helmet-cat-ear-pods", catEars);
    setPartVisible(rig, "walking-staff", staff);
    setPartVisible(rig, "assistive-lower-body-module", assistModule);
    setPartVisible(rig, "dust-gaiter-left", dustModule);
    setPartVisible(rig, "dust-gaiter-right", dustModule);
    setPartVisible(rig, "haptic-module", haptics);
    applyPantsStyle(rig.root, pantsStyle);
  }, [assistModule, catEars, dustModule, haptics, pantsStyle, staff]);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    applyAppearance(rig.root, resolvedPalette, selectedPartId, cutaway);
  }, [cutaway, resolvedPalette, selectedPartId]);

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
      aria-label="Interactive procedural surface suit"
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
              The configured suit still includes the pressure helmet, layered torso,
              articulated joints, gloves, boots, life-support backpack, and selected
              mobility modules.
            </p>
          </div>
        ) : null}
      </div>

      <div className="surface-suit-scene__status">
        <p className="surface-suit-scene__camera-status">{cameraLabel}</p>
        <p className="surface-suit-scene__selection" aria-live="polite">
          {selectedLabel(selectedPartId)}
        </p>
        {walking ? (
          <p className="surface-suit-scene__walking-note">
            Illustrative walking preview — not a biomechanical simulation.
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
