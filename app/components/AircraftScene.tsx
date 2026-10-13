"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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
      material.transparent = opacity < 0.999;
      material.opacity = opacity;
      material.depthWrite = opacity > 0.55;
    });
  });
}

function makeTunnel() {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(15, 6.8, 19);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x8394d9, transparent: true, opacity: 0.16 }),
  );
  group.add(edges);

  const floor = new THREE.GridHelper(18, 18, 0x8671dc, 0x8fa4cf);
  floor.rotation.x = 0;
  floor.position.y = -3.4;
  const floorMaterials = Array.isArray(floor.material) ? floor.material : [floor.material];
  floorMaterials.forEach((material) => {
    material.transparent = true;
    material.opacity = 0.11;
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

function makeShockCue() {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: 0xeb8bcd,
    transparent: true,
    opacity: 0.72,
  });
  for (let ring = 0; ring < 4; ring += 1) {
    const z = -5.6 + ring * 2.7;
    const size = 0.7 + ring * 1.25;
    const points = [
      new THREE.Vector3(0, 0, z),
      new THREE.Vector3(size, size * 0.34, z + 3.6),
      new THREE.Vector3(0, 0, z),
      new THREE.Vector3(-size, size * 0.34, z + 3.6),
      new THREE.Vector3(0, 0, z),
      new THREE.Vector3(size, -size * 0.34, z + 3.6),
      new THREE.Vector3(0, 0, z),
      new THREE.Vector3(-size, -size * 0.34, z + 3.6),
    ];
    const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material.clone());
    group.add(line);
  }
  return group;
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
    shock: THREE.Group;
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
    scene.fog = new THREE.FogExp2(0xeef0fc, 0.017);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
    camera.position.copy(cameraPosition("perspective"));
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6570a8, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 4.6);
    key.position.set(-7, 10, -8);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9f79ff, 5.4);
    rim.position.set(8, 1, 9);
    scene.add(rim);
    const cyan = new THREE.PointLight(0x5ed7f1, 12, 30, 2);
    cyan.position.set(-5, -1, -5);
    scene.add(cyan);

    const tunnel = makeTunnel();
    scene.add(tunnel);
    const { group: streamGroup, lines: streams } = makeStreamlines();
    scene.add(streamGroup);
    const pressure = makePressureOverlay();
    scene.add(pressure);
    const shock = makeShockCue();
    scene.add(shock);

    const aircraftContainer = new THREE.Group();
    aircraftContainer.rotation.x = -0.035;
    scene.add(aircraftContainer);
    const interactive: InteractivePart[] = [];
    const moduleObjects = new Map<string, THREE.Object3D[]>();
    const exteriorObjects: THREE.Object3D[] = [];
    const engineObjects: THREE.Object3D[] = [];
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
        shock,
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
    const render = () => {
      if (disposed) return;
      const elapsed = clock.getElapsedTime();
      const live = livePropsRef.current;
      updateStreamlines(
        streams,
        elapsed,
        live.airflowRunning,
        live.configuration.speedMps,
        live.configuration.angleOfAttackDeg,
      );
      interactive.forEach(({ object, partId }) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (!(material instanceof THREE.MeshStandardMaterial)) return;
          material.emissive.set(partId === live.selectedPartId ? 0x6b55d8 : 0x000000);
          material.emissiveIntensity = partId === live.selectedPartId
            ? 0.28 + Math.sin(elapsed * 4) * 0.08
            : 0;
        });
      });
      engineObjects.forEach((object, index) => {
        if (/CORE/i.test(object.name)) object.rotation.z += 0.006 + index * 0.0003;
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
    state.pressure.visible = configuration.flowMode === "pressure";
    state.shock.visible = configuration.flowMode === "shock-cues" && result.mach > 1;

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
