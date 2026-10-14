"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import type {
  ContactFlightConfiguration,
  ContactFlightResult,
  ContactModuleId,
} from "../../lib/contact-flight/model";

export type AircraftCameraPreset = "perspective" | "top" | "side" | "front";
export type AircraftAssemblyMode = "external" | "cutaway" | "exploded";

export interface AircraftSceneProps {
  active: boolean;
  configuration: ContactFlightConfiguration;
  result: ContactFlightResult;
  selectedPartId: string;
  onSelectPart: (partId: string) => void;
  cameraPreset: AircraftCameraPreset;
  cameraRequestKey: number;
  assemblyMode: AircraftAssemblyMode;
  airflowRunning: boolean;
  className?: string;
}

type SceneStatus = "loading" | "ready" | "fallback" | "error";

interface InteractivePart {
  object: THREE.Object3D;
  partId: string;
}

const MODULE_ASSET_IDS: Record<ContactModuleId, string | null> = {
  "spectral-sensor": "multispectral-sensor",
  "sensor-shutters": "sensor-shutters",
  "em-hardening": "em-hardening",
  "radiation-liner": "radiation-liner",
  "bio-isolation": "biofiltration-intake",
  "contact-array": "first-contact-array",
  "redundant-controls": "redundant-controls",
  "thermal-loop": "thermal-management",
  "observer-pod": "observer-buoy",
  "anomaly-detector": "field-sensor",
};

const ASSET_MODULE_TO_CONFIG = Object.fromEntries(
  Object.entries(MODULE_ASSET_IDS)
    .filter((entry): entry is [ContactModuleId, string] => entry[1] !== null)
    .map(([configId, assetId]) => [assetId, configId]),
) as Record<string, ContactModuleId>;

const PART_NAME_RULES: ReadonlyArray<[RegExp, string]> = [
  [/PART_CANOPY/i, "canopy"],
  [/PART_WING/i, "wing"],
  [/PART_ELEVON/i, "elevons"],
  [/PART_INTAKE/i, "intakes"],
  [/PART_ENGINE_CORE/i, "compressor"],
  [/PART_NOZZLE/i, "nozzles"],
  [/PART_VTAIL/i, "tails"],
  [/PART_FUSELAGE/i, "fuselage"],
];

function readablePartId(object: THREE.Object3D) {
  const moduleId = object.userData.module_id as string | undefined;
  if (moduleId && ASSET_MODULE_TO_CONFIG[moduleId]) return ASSET_MODULE_TO_CONFIG[moduleId];
  const explicitPart = object.userData.part_id as string | undefined;
  if (explicitPart) {
    const normalized = explicitPart.toLowerCase();
    if (ASSET_MODULE_TO_CONFIG[normalized]) return ASSET_MODULE_TO_CONFIG[normalized];
    if (normalized.includes("canopy")) return "canopy";
    if (normalized.includes("wing")) return "wing";
    if (normalized.includes("elevon")) return "elevons";
    if (normalized.includes("intake")) return "intakes";
    if (normalized.includes("engine") || normalized.includes("compressor")) return "compressor";
    if (normalized.includes("nozzle")) return "nozzles";
    if (normalized.includes("tail")) return "tails";
    if (normalized.includes("fuselage")) return "fuselage";
  }
  return PART_NAME_RULES.find(([pattern]) => pattern.test(object.name))?.[1] ?? null;
}

function cloneMaterials(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      material.dithering = true;
      material.userData.rievaBaseOpacity = material.opacity;
      material.userData.rievaBaseTransparent = material.transparent;
      material.userData.rievaBaseDepthWrite = material.depthWrite;
      if (!(material instanceof THREE.MeshStandardMaterial)) return;
      material.envMapIntensity = 1.35;
      material.userData.rievaBaseEmissive = material.emissive.clone();
      material.userData.rievaBaseEmissiveIntensity = material.emissiveIntensity;
    });
    object.castShadow = true;
    object.receiveShadow = true;
  });
}

function createLoftGeometry(
  sections: ReadonlyArray<{ z: number; width: number; height: number }>,
  radialSegments = 14,
) {
  const vertices: number[] = [];
  const indices: number[] = [];
  sections.forEach((section) => {
    for (let index = 0; index < radialSegments; index += 1) {
      const angle = (index / radialSegments) * Math.PI * 2;
      const sideFlatten = 0.87 + 0.13 * Math.abs(Math.sin(angle));
      vertices.push(
        Math.cos(angle) * section.width * sideFlatten,
        Math.sin(angle) * section.height,
        section.z,
      );
    }
  });
  for (let section = 0; section < sections.length - 1; section += 1) {
    for (let index = 0; index < radialSegments; index += 1) {
      const next = (index + 1) % radialSegments;
      const a = section * radialSegments + index;
      const b = section * radialSegments + next;
      const c = (section + 1) * radialSegments + next;
      const d = (section + 1) * radialSegments + index;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createWingGeometry(side: -1 | 1) {
  const outline = [
    [0.22, -1.25],
    [2.15, -0.8],
    [5.3, 1.25],
    [5.0, 2.05],
    [2.0, 1.05],
    [0.38, 2.55],
  ] as const;
  const thickness = 0.11;
  const vertices: number[] = [];
  outline.forEach(([x, z]) => vertices.push(side * x, thickness, z));
  outline.forEach(([x, z]) => vertices.push(side * x, -thickness, z));
  const n = outline.length;
  const indices: number[] = [];
  for (let index = 1; index < n - 1; index += 1) {
    indices.push(0, index, index + 1, n, n + index + 1, n + index);
  }
  for (let index = 0; index < n; index += 1) {
    const next = (index + 1) % n;
    indices.push(index, next, n + index, next, n + next, n + index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createFallbackAircraft() {
  const root = new THREE.Group();
  root.name = "AERIS_X_FALLBACK";
  const pearl = new THREE.MeshPhysicalMaterial({
    color: 0xe9eef8,
    metalness: 0.42,
    roughness: 0.28,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
  });
  const dark = new THREE.MeshPhysicalMaterial({
    color: 0x16172b,
    metalness: 0.5,
    roughness: 0.26,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x795ed5,
    metalness: 0.15,
    roughness: 0.1,
    transmission: 0.36,
    transparent: true,
    opacity: 0.78,
  });

  const fuselage = new THREE.Mesh(
    createLoftGeometry([
      { z: -6.1, width: 0.04, height: 0.03 },
      { z: -5.1, width: 0.28, height: 0.22 },
      { z: -3.1, width: 0.7, height: 0.58 },
      { z: -0.8, width: 1.05, height: 0.76 },
      { z: 1.7, width: 1.15, height: 0.68 },
      { z: 3.8, width: 0.72, height: 0.54 },
      { z: 5.1, width: 0.25, height: 0.25 },
    ]),
    pearl,
  );
  fuselage.name = "PART_FUSELAGE";
  fuselage.userData.part_id = "fuselage";
  root.add(fuselage);

  for (const side of [-1, 1] as const) {
    const wing = new THREE.Mesh(createWingGeometry(side), pearl.clone());
    wing.position.y = -0.08;
    wing.name = side < 0 ? "PART_WING_L" : "PART_WING_R";
    wing.userData.part_id = side < 0 ? "wing-left" : "wing-right";
    root.add(wing);
  }

  const canopy = new THREE.Mesh(
    createLoftGeometry([
      { z: -3.6, width: 0.05, height: 0.03 },
      { z: -2.8, width: 0.43, height: 0.25 },
      { z: -1.6, width: 0.52, height: 0.42 },
      { z: -0.55, width: 0.25, height: 0.18 },
    ], 12),
    glass,
  );
  canopy.position.y = 0.57;
  canopy.name = "PART_CANOPY";
  canopy.userData.part_id = "canopy";
  root.add(canopy);

  for (const side of [-1, 1] as const) {
    const inlet = new THREE.Mesh(
      createLoftGeometry([
        { z: -1.2, width: 0.36, height: 0.22 },
        { z: 0.1, width: 0.43, height: 0.25 },
        { z: 2.6, width: 0.38, height: 0.28 },
      ], 10),
      dark.clone(),
    );
    inlet.position.set(side * 0.83, -0.13, 0);
    inlet.name = side < 0 ? "PART_INTAKE_L" : "PART_INTAKE_R";
    inlet.userData.part_id = side < 0 ? "intake-left" : "intake-right";
    root.add(inlet);
  }
  return root;
}

function setObjectOpacity(object: THREE.Object3D, opacity: number) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      const baseOpacity = Number(material.userData.rievaBaseOpacity ?? material.opacity);
      const baseTransparent = Boolean(
        material.userData.rievaBaseTransparent ?? material.transparent,
      );
      const baseDepthWrite = Boolean(
        material.userData.rievaBaseDepthWrite ?? material.depthWrite,
      );
      material.transparent = baseTransparent || opacity < 0.999;
      material.opacity = baseOpacity * opacity;
      material.depthWrite = opacity > 0.55 ? baseDepthWrite : false;
      material.needsUpdate = true;
    });
  });
}

function makeTunnel() {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(15, 6.8, 19);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x8394d9, transparent: true, opacity: 0.075 }),
  );
  group.add(edges);

  const studioFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 34),
    new THREE.MeshPhysicalMaterial({
      color: 0xe8eaf3,
      roughness: 0.72,
      metalness: 0.04,
      clearcoat: 0.16,
      clearcoatRoughness: 0.64,
    }),
  );
  studioFloor.rotation.x = -Math.PI / 2;
  studioFloor.position.y = -3.38;
  studioFloor.receiveShadow = true;
  group.add(studioFloor);

  const floor = new THREE.GridHelper(24, 24, 0x8671dc, 0x8fa4cf);
  floor.position.y = -3.36;
  const floorMaterials = Array.isArray(floor.material) ? floor.material : [floor.material];
  floorMaterials.forEach((material) => {
    material.transparent = true;
    material.opacity = 0.055;
  });
  group.add(floor);
  return group;
}

function seeded(index: number, offset = 0) {
  const value = Math.sin(index * 91.73 + offset * 47.19) * 43_758.5453;
  return value - Math.floor(value);
}

function makeStreamlines() {
  const group = new THREE.Group();
  const lines: THREE.Line[] = [];
  for (let index = 0; index < 44; index += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(15 * 3), 3));
    const color = new THREE.Color().setHSL(0.57 + seeded(index, 4) * 0.18, 0.7, 0.64);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.32 + seeded(index, 5) * 0.3,
    });
    const line = new THREE.Line(geometry, material);
    line.userData.seedX = (seeded(index, 1) - 0.5) * 13.2;
    line.userData.seedY = (seeded(index, 2) - 0.5) * 5.5;
    line.userData.phase = seeded(index, 3) * 19;
    lines.push(line);
    group.add(line);
  }
  return { group, lines };
}

function updateStreamlines(
  lines: THREE.Line[],
  elapsed: number,
  running: boolean,
  speedMps: number,
  angleDeg: number,
) {
  const travel = running ? elapsed * (1.2 + speedMps / 140) : 0;
  const alpha = (angleDeg * Math.PI) / 180;
  for (const line of lines) {
    const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    const seedX = line.userData.seedX as number;
    const seedY = line.userData.seedY as number;
    const phase = line.userData.phase as number;
    for (let point = 0; point < 15; point += 1) {
      let z = ((phase + travel + point * 0.48) % 19) - 9.5;
      const local = Math.exp(-0.13 * z * z);
      const wingBand = Math.exp(-0.55 * (z - 0.5) ** 2);
      const centerAvoidance = Math.exp(-0.75 * seedX * seedX - 0.8 * seedY * seedY);
      const sideSign = Math.sign(seedX || 1);
      const verticalSign = Math.sign(seedY || 1);
      const x = seedX + sideSign * local * centerAvoidance * 1.2 + sideSign * wingBand * 0.08;
      const y =
        seedY +
        verticalSign * local * centerAvoidance * 0.72 +
        Math.sin(alpha) * (z + 4) * 0.22 * local;
      z += Math.cos(alpha) * 0.02 * seedY;
      positions.setXYZ(point, x, y, z);
    }
    positions.needsUpdate = true;
  }
}

function makePressureOverlay() {
  const group = new THREE.Group();
  const topMaterial = new THREE.MeshBasicMaterial({
    color: 0xef7bc5,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lowMaterial = new THREE.MeshBasicMaterial({
    color: 0x5fd4f2,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  for (const side of [-1, 1] as const) {
    const wing = new THREE.Mesh(createWingGeometry(side), topMaterial.clone());
    wing.scale.setScalar(1.01);
    wing.position.y = 0.18;
    group.add(wing);
    const lower = new THREE.Mesh(createWingGeometry(side), lowMaterial.clone());
    lower.scale.setScalar(1.01);
    lower.position.y = -0.19;
    group.add(lower);
  }
  return group;
}

function makePressureSurfaceMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      lowColor: { value: new THREE.Color(0x51d5ee) },
      highColor: { value: new THREE.Color(0xed7bc6) },
      opacity: { value: 0.23 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 lowColor;
      uniform vec3 highColor;
      uniform float opacity;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        float side = smoothstep(-0.42, 0.42, vNormal.y);
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.2);
        vec3 color = mix(lowColor, highColor, side);
        gl_FragColor = vec4(color, opacity * (0.42 + fresnel * 0.85));
      }
    `,
  });
}

function makeShockCue() {
  const group = new THREE.Group();
  const shellMaterial = new THREE.MeshBasicMaterial({
    color: 0xeb8bcd,
    transparent: true,
    opacity: 0.075,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(5.4, 9.5, 64, 1, true), shellMaterial);
  // ConeGeometry's apex is +Y. Rotate it toward the -Z nose so the cue widens
  // downstream over the aircraft rather than converging toward the tail.
  cone.rotation.x = -Math.PI / 2;
  cone.position.z = -1.25;
  group.add(cone);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x9a73ed,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  for (let ring = 0; ring < 4; ring += 1) {
    const radius = 0.75 + ring * 1.05;
    const band = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.015, 6, 72), ringMaterial.clone());
    band.position.z = -3.8 + ring * 2.05;
    group.add(band);
  }
  return group;
}

function makeEnginePlumes() {
  const group = new THREE.Group();
  for (const side of [-1, 1] as const) {
    const plumeMaterial = new THREE.MeshBasicMaterial({
      color: 0xa9eaff,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.4, 3.4, 40, 1, true), plumeMaterial);
    plume.name = "Illustrative exhaust heat plume";
    plume.rotation.x = -Math.PI / 2;
    plume.position.set(side * 0.62, -0.3, 7.55);
    plume.userData.baseOpacity = plumeMaterial.opacity;
    plume.userData.anchorName = side < 0 ? "ANCHOR_EXHAUST_L" : "ANCHOR_EXHAUST_R";
    plume.userData.plumeLength = 3.4;
    group.add(plume);

    const hotCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xf5fbff,
      transparent: true,
      opacity: 0.23,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const hotCore = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.85, 32, 1, true), hotCoreMaterial);
    hotCore.name = "Illustrative exhaust core";
    hotCore.rotation.x = -Math.PI / 2;
    hotCore.position.set(side * 0.62, -0.3, 6.78);
    hotCore.userData.baseOpacity = hotCoreMaterial.opacity;
    hotCore.userData.anchorName = side < 0 ? "ANCHOR_EXHAUST_L" : "ANCHOR_EXHAUST_R";
    hotCore.userData.plumeLength = 1.85;
    group.add(hotCore);
  }
  return group;
}

function alignExhaustToAsset(
  model: THREE.Object3D,
  exhaust: THREE.Group,
) {
  model.updateWorldMatrix(true, true);
  for (const child of exhaust.children) {
    const anchorName = child.userData.anchorName as string | undefined;
    const anchor = anchorName ? model.getObjectByName(anchorName) : null;
    if (!anchor) continue;
    const anchorPosition = anchor.getWorldPosition(new THREE.Vector3());
    const length = Number(child.userData.plumeLength ?? 0);
    child.position.copy(anchorPosition).add(new THREE.Vector3(0, 0, length / 2));
  }
}

function cameraPosition(preset: AircraftCameraPreset) {
  if (preset === "top") return new THREE.Vector3(0, 13.8, 0.4);
  if (preset === "side") return new THREE.Vector3(13.6, 3.0, 1.2);
  if (preset === "front") return new THREE.Vector3(0, 2.1, -14.2);
  return new THREE.Vector3(10.8, 6.7, 11.8);
}

export function AircraftScene({
  active,
  configuration,
  result,
  selectedPartId,
  onSelectPart,
  cameraPreset,
  cameraRequestKey,
  assemblyMode,
  airflowRunning,
  className,
}: AircraftSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const livePropsRef = useRef({
    configuration,
    selectedPartId,
    airflowRunning,
    onSelectPart,
  });
  useEffect(() => {
    livePropsRef.current = {
      configuration,
      selectedPartId,
      airflowRunning,
      onSelectPart,
    };
  }, [airflowRunning, configuration, onSelectPart, selectedPartId]);
  const sceneStateRef = useRef<{
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    root: THREE.Group;
    interactive: InteractivePart[];
    moduleObjects: Map<string, THREE.Object3D[]>;
    exteriorObjects: THREE.Object3D[];
    engineObjects: THREE.Object3D[];
    basePositions: Map<THREE.Object3D, THREE.Vector3>;
    streams: THREE.Line[];
    pressure: THREE.Group;
    pressureSurfaces: THREE.Mesh[];
    shock: THREE.Group;
    exhaust: THREE.Group;
    selectionHalo: THREE.Box3Helper;
    renderer: THREE.WebGLRenderer;
  } | null>(null);
  const [status, setStatus] = useState<SceneStatus>("loading");
  const [statusDetail, setStatusDetail] = useState("Loading Blender aircraft…");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let frame = 0;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xeef0fc, 0.012);
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 120);
    camera.position.copy(cameraPosition("perspective"));
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    RectAreaLightUniformsLib.init();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environmentTarget = pmrem.fromScene(room, 0.045);
    scene.environment = environmentTarget.texture;
    pmrem.dispose();
    room.dispose();
    host.replaceChildren(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Interactive 3D AERIS-X research aircraft");
    renderer.domElement.tabIndex = 0;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 28;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6570a8, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 4.2);
    key.position.set(-7, 10, -8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.00012;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9f79ff, 3.8);
    rim.position.set(8, 1, 9);
    scene.add(rim);
    const cyan = new THREE.PointLight(0x5ed7f1, 8, 30, 2);
    cyan.position.set(-5, -1, -5);
    scene.add(cyan);
    const softbox = new THREE.RectAreaLight(0xffffff, 7.5, 8, 5);
    softbox.position.set(4.8, 7.5, -2.5);
    softbox.lookAt(0, 0, 0);
    scene.add(softbox);
    const edgebox = new THREE.RectAreaLight(0xbca8ff, 5, 5, 7);
    edgebox.position.set(-6.5, 2.2, 7.5);
    edgebox.lookAt(0, 0, 0);
    scene.add(edgebox);

    const tunnel = makeTunnel();
    scene.add(tunnel);
    const { group: streamGroup, lines: streams } = makeStreamlines();
    scene.add(streamGroup);
    const pressure = makePressureOverlay();
    scene.add(pressure);
    const shock = makeShockCue();
    scene.add(shock);
    const exhaust = makeEnginePlumes();
    scene.add(exhaust);
    const selectionHalo = new THREE.Box3Helper(
      new THREE.Box3(),
      new THREE.Color(0x8c73ed),
    );
    selectionHalo.visible = false;
    const selectionMaterials = Array.isArray(selectionHalo.material)
      ? selectionHalo.material
      : [selectionHalo.material];
    selectionMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.48;
      material.depthTest = false;
    });
    scene.add(selectionHalo);

    const aircraftContainer = new THREE.Group();
    aircraftContainer.rotation.x = -0.035;
    scene.add(aircraftContainer);
    const interactive: InteractivePart[] = [];
    const moduleObjects = new Map<string, THREE.Object3D[]>();
    const exteriorObjects: THREE.Object3D[] = [];
    const engineObjects: THREE.Object3D[] = [];
    const pressureSurfaces: THREE.Mesh[] = [];
    const basePositions = new Map<THREE.Object3D, THREE.Vector3>();

    const registerModel = (model: THREE.Object3D, fallback: boolean) => {
      cloneMaterials(model);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = 11.7 / Math.max(size.x, size.z, 0.001);
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      aircraftContainer.add(model);
      alignExhaustToAsset(model, exhaust);
      model.traverse((object) => {
        const partId = readablePartId(object);
        const moduleId = object.userData.module_id as string | undefined;
        basePositions.set(object, object.position.clone());
        if (moduleId) {
          const list = moduleObjects.get(moduleId) ?? [];
          list.push(object);
          moduleObjects.set(moduleId, list);
        }
        if (partId) {
          interactive.push({ object, partId });
          if (
            partId === "fuselage" ||
            partId === "canopy" ||
            partId === "wing" ||
            partId === "elevons" ||
            partId === "tails"
          ) exteriorObjects.push(object);
          if (partId === "compressor" || partId === "nozzles") engineObjects.push(object);
        }
      });
      if (!fallback) {
        const wingMeshes = interactive
          .filter((item) => item.partId === "wing" && item.object instanceof THREE.Mesh)
          .map((item) => item.object as THREE.Mesh);
        wingMeshes.forEach((wingMesh) => {
          const overlay = new THREE.Mesh(wingMesh.geometry.clone(), makePressureSurfaceMaterial());
          overlay.name = "Computed-pressure visualization skin";
          overlay.scale.setScalar(1.004);
          overlay.renderOrder = 4;
          overlay.visible = false;
          overlay.raycast = () => undefined;
          wingMesh.add(overlay);
          pressureSurfaces.push(overlay);
        });
      }
      sceneStateRef.current = {
        camera,
        controls,
        root: aircraftContainer,
        interactive,
        moduleObjects,
        exteriorObjects,
        engineObjects,
        basePositions,
        streams,
        pressure,
        pressureSurfaces,
        shock,
        exhaust,
        selectionHalo,
        renderer,
      };
      setStatus(fallback ? "fallback" : "ready");
      setStatusDetail(
        fallback
          ? "Blender asset unavailable; showing the mesh-built aerodynamic fallback."
          : "Blender-authored AERIS-X loaded. Drag to rotate; select a named part to inspect it.",
      );
    };

    new GLTFLoader().load(
      "/models/rieva-aeris-x.glb",
      (gltf) => {
        if (disposed) return;
        registerModel(gltf.scene, false);
      },
      undefined,
      () => {
        if (disposed) return;
        registerModel(createFallbackAircraft(), true);
      },
    );

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerStart = { x: 0, y: 0 };
    const onPointerDown = (event: PointerEvent) => {
      pointerStart = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 7) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const clickable = interactive.flatMap((item) => {
        const meshes: THREE.Object3D[] = [];
        item.object.traverse((child) => {
          if (child instanceof THREE.Mesh && child.visible) {
            child.userData.__contactPartId = item.partId;
            meshes.push(child);
          }
        });
        return meshes;
      });
      const hit = raycaster.intersectObjects(clickable, false)[0];
      const partId = hit?.object.userData.__contactPartId as string | undefined;
      if (partId) livePropsRef.current.onSelectPart(partId);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const clock = new THREE.Clock();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const neutralEmissive = new THREE.Color(0x000000);
    const highlightedEmissive = new THREE.Color(0x7056d8);
    const render = () => {
      if (disposed) return;
      const elapsed = clock.getElapsedTime();
      const live = livePropsRef.current;
      updateStreamlines(
        streams,
        elapsed,
        live.airflowRunning && !reducedMotion,
        live.configuration.speedMps,
        live.configuration.angleOfAttackDeg,
      );
      const selectedBounds = new THREE.Box3();
      let hasSelectedBounds = false;
      interactive.forEach(({ object, partId }) => {
        if (partId === live.selectedPartId && object.visible) {
          selectedBounds.expandByObject(object, true);
          hasSelectedBounds = true;
        }
        object.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            if (!(material instanceof THREE.MeshStandardMaterial)) return;
            const baseColor = material.userData.rievaBaseEmissive as THREE.Color | undefined;
            const baseIntensity = Number(material.userData.rievaBaseEmissiveIntensity ?? 0);
            material.emissive.copy(baseColor ?? neutralEmissive);
            material.emissiveIntensity = partId === live.selectedPartId
              ? Math.max(baseIntensity, reducedMotion ? 0.16 : 0.18 + Math.sin(elapsed * 3.2) * 0.035)
              : baseIntensity;
            if (partId === live.selectedPartId) material.emissive.lerp(highlightedEmissive, 0.38);
          });
        });
      });
      selectionHalo.visible = hasSelectedBounds;
      if (hasSelectedBounds) selectionHalo.box.copy(selectedBounds).expandByScalar(0.055);
      engineObjects.forEach((object, index) => {
        if (/CORE/i.test(object.name) && !reducedMotion) object.rotation.z += 0.004 + index * 0.0002;
      });
      exhaust.visible = live.airflowRunning;
      exhaust.children.forEach((child, index) => {
        if (!(child instanceof THREE.Mesh)) return;
        const material = child.material as THREE.MeshBasicMaterial;
        const pulse = reducedMotion ? 1 : 0.92 + Math.sin(elapsed * 7.2 + index * 0.8) * 0.08;
        material.opacity = Number(child.userData.baseOpacity ?? 0.12) * pulse;
        child.scale.y = pulse;
      });
      controls.update();
      renderer.render(scene, camera);
      if (active) frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments)) return;
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      environmentTarget.dispose();
      sceneStateRef.current = null;
      host.replaceChildren();
    };
  }, [active]); // The persistent scene is rebuilt only when its workspace activates/deactivates.

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    state.streams.forEach((line) => {
      const material = line.material as THREE.LineBasicMaterial;
      if (configuration.flowMode === "pressure") material.opacity = 0.15;
      else if (configuration.flowMode === "shock-cues") material.opacity = 0.22;
      else material.opacity = 0.46;
    });
    state.pressure.visible = configuration.flowMode === "pressure" && state.pressureSurfaces.length === 0;
    state.pressureSurfaces.forEach((surface) => {
      surface.visible = configuration.flowMode === "pressure";
    });
    state.shock.visible = configuration.flowMode === "shock-cues" && result.mach > 1;
    if (state.shock.visible) {
      const coneScale = THREE.MathUtils.clamp(1 / Math.sqrt(result.mach * result.mach - 1), 0.24, 1.4);
      state.shock.scale.set(coneScale, coneScale, 1);
    }

    for (const [configId, assetId] of Object.entries(MODULE_ASSET_IDS) as Array<
      [ContactModuleId, string | null]
    >) {
      if (!assetId) continue;
      const enabled = configuration.modules[configId];
      state.moduleObjects.get(assetId)?.forEach((object) => {
        object.visible = enabled;
      });
    }
  }, [configuration, result.mach, status]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    state.exteriorObjects.forEach((object) => {
      setObjectOpacity(object, assemblyMode === "cutaway" ? 0.2 : 1);
    });
    state.engineObjects.forEach((object) => {
      object.visible = assemblyMode !== "external";
    });
    state.basePositions.forEach((base, object) => {
      object.position.copy(base);
      if (assemblyMode !== "exploded") return;
      const partId = readablePartId(object);
      if (partId === "wing") object.position.x += Math.sign(base.x || 1) * 0.55;
      if (partId === "tails") object.position.y += 0.38;
      if (partId === "compressor" || partId === "nozzles") object.position.y -= 0.5;
      if (ASSET_MODULE_TO_CONFIG[object.userData.module_id as string]) object.position.y += 0.7;
    });
  }, [assemblyMode, status]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    const position = cameraPosition(cameraPreset);
    state.camera.position.copy(position);
    state.controls.target.set(0, 0, 0);
    state.controls.update();
  }, [cameraPreset, cameraRequestKey, status]);

  return (
    <div className={className} ref={hostRef} data-scene-status={status}>
      <div role="status" aria-live="polite" className="aircraft-scene-status">
        <span>{status === "loading" ? "Preparing 3D flight tunnel" : status === "fallback" ? "Fallback model active" : "3D model ready"}</span>
        <small>{statusDetail}</small>
      </div>
      <noscript>
        The interactive aircraft requires JavaScript. The aerodynamic values and research notes remain available as text.
      </noscript>
    </div>
  );
}
