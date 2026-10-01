"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ergosphereRadiusRg, kerrRadii, type OrbitDirection, type ProbeKind } from "../../lib/black-hole/model";
import styles from "./BlackHoleLab.module.css";

export interface BlackHoleSceneProps {
  active?: boolean;
  spin: number;
  radiusRg: number;
  direction: OrbitDirection;
  probeKind: ProbeKind;
  animationMode: "orbit" | "precess" | "plunge" | "photon";
  playing: boolean;
  speed?: number;
}

interface SceneSettings {
  active: boolean;
  spin: number;
  radiusRg: number;
  direction: OrbitDirection;
  probeKind: ProbeKind;
  animationMode: BlackHoleSceneProps["animationMode"];
  playing: boolean;
  speed: number;
}

interface CameraOrbit {
  yaw: number;
  pitch: number;
  distance: number;
}

const RG_SCALE = 0.62;

function radiusToWorld(radiusRg: number) {
  const clamped = Math.max(0.2, radiusRg);
  return RG_SCALE *
    (clamped <= 10 ? clamped : 10 + Math.log1p(clamped - 10) * 2.2);
}

function createOrbitLine(radiusRg: number, color: number, opacity: number) {
  const radius = radiusToWorld(radiusRg);
  const points = Array.from({ length: 160 }, (_, index) => {
    const angle = (index / 160) * Math.PI * 2;
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius,
    );
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineDashedMaterial({
    color,
    transparent: true,
    opacity,
    dashSize: 0.16,
    gapSize: 0.11,
    depthWrite: false,
  });
  const line = new THREE.LineLoop(geometry, material);
  line.computeLineDistances();
  return line;
}

function createProbe(kind: ProbeKind) {
  const group = new THREE.Group();
  group.name = "orbiting-test-object";

  if (kind === "photon") {
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 20, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    const glow = new THREE.PointLight(0x9bdcff, 3.2, 2.5);
    group.add(core, glow);
    return group;
  }

  if (kind === "star") {
    group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 28, 18),
        new THREE.MeshStandardMaterial({
          color: 0xffd488,
          emissive: 0xff6b8f,
          emissiveIntensity: 1.8,
          roughness: 0.75,
        }),
      ),
    );
    return group;
  }

  if (kind === "astronaut") {
    const suit = new THREE.MeshStandardMaterial({
      color: 0xf5f1ff,
      metalness: 0.25,
      roughness: 0.45,
    });
    const visor = new THREE.MeshStandardMaterial({
      color: 0x9e65ff,
      emissive: 0x24104f,
      emissiveIntensity: 0.8,
      metalness: 0.72,
      roughness: 0.18,
    });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.18, 6, 12), suit);
    torso.rotation.z = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 18, 12), visor);
    head.position.x = 0.2;
    group.add(torso, head);
    group.scale.setScalar(1.45);
    return group;
  }

  const shell = new THREE.MeshStandardMaterial({
    color: 0xf8f5ff,
    metalness: 0.76,
    roughness: 0.2,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x8d5cff,
    emissive: 0x38117d,
    emissiveIntensity: 1.2,
    metalness: 0.5,
    roughness: 0.25,
  });
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 8, 18), shell);
  hull.rotation.z = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.19, 20), shell);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 0.27;
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.1, 18), accent);
  engine.rotation.z = Math.PI / 2;
  engine.position.x = -0.25;
  const wingGeometry = new THREE.BoxGeometry(0.18, 0.02, 0.32);
  const wing = new THREE.Mesh(wingGeometry, accent);
  wing.position.x = -0.02;
  group.add(hull, nose, engine, wing);
  group.scale.setScalar(1.35);
  return group;
}

function createAccretionMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      intensity: { value: 1 },
    },
    vertexShader: `
      varying vec2 vDisk;
      void main() {
        vDisk = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float intensity;
      varying vec2 vDisk;
      void main() {
        float r = length(vDisk);
        float a = atan(vDisk.y, vDisk.x);
        float heat = smoothstep(6.4, 1.4, r);
        float edge = smoothstep(1.3, 1.65, r) * (1.0 - smoothstep(5.5, 6.55, r));
        float filament = 0.58 + 0.42 * sin(a * 8.0 - r * 6.0 - time * 1.8);
        float fine = 0.7 + 0.3 * sin(a * 21.0 + r * 11.0 + time * 0.9);
        vec3 violet = vec3(0.32, 0.12, 0.92);
        vec3 blue = vec3(0.18, 0.7, 1.0);
        vec3 hot = vec3(1.0, 0.76, 0.48);
        vec3 color = mix(violet, blue, clamp(r / 6.5, 0.0, 1.0));
        color = mix(color, hot, heat * 0.7);
        float alpha = edge * (0.18 + filament * fine * 0.55) * intensity;
        gl_FragColor = vec4(color * (0.72 + heat), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

export function BlackHoleScene({
  active = true,
  spin,
  radiusRg,
  direction,
  probeKind,
  animationMode,
  playing,
  speed = 1,
}: BlackHoleSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [viewName, setViewName] = useState("Oblique");
  const settingsRef = useRef<SceneSettings>({
    active,
    spin,
    radiusRg,
    direction,
    probeKind,
    animationMode,
    playing,
    speed,
  });
  const cameraOrbitRef = useRef<CameraOrbit>({ yaw: 0.72, pitch: 0.34, distance: 13.5 });
  const setViewRef = useRef<(name: string) => void>(() => undefined);
  const zoomRef = useRef<(delta: number) => void>(() => undefined);
  const animationFrameRef = useRef<number | null>(null);
  const renderLoopRef = useRef<((time: number) => void) | null>(null);
  const contextLostRef = useRef(false);

  useEffect(() => {
    settingsRef.current = {
      active,
      spin,
      radiusRg,
      direction,
      probeKind,
      animationMode,
      playing,
      speed,
    };
    if (!active && animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    } else if (
      active &&
      !contextLostRef.current &&
      animationFrameRef.current === null &&
      renderLoopRef.current
    ) {
      animationFrameRef.current = window.requestAnimationFrame(renderLoopRef.current);
    }
  }, [active, animationMode, direction, playing, probeKind, radiusRg, speed, spin]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      contextLostRef.current = true;
      const errorTimer = window.setTimeout(() => setWebglError(true), 0);
      return () => window.clearTimeout(errorTimer);
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.setAttribute("aria-label", "Interactive coordinate-scale model of a rotating Kerr black hole");
    renderer.domElement.setAttribute("role", "img");
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070317, 0.025);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 120);
    const cameraTarget = new THREE.Vector3(0, 0, 0);

    const ambient = new THREE.HemisphereLight(0xdac8ff, 0x080319, 1.9);
    const rim = new THREE.DirectionalLight(0x9ccfff, 3.2);
    rim.position.set(5, 6, 7);
    const violetLight = new THREE.PointLight(0xa060ff, 25, 16);
    violetLight.position.set(-4, 2, -3);
    scene.add(ambient, rim, violetLight);

    const starCount = 920;
    const starPositions = new Float32Array(starCount * 3);
    for (let index = 0; index < starCount; index += 1) {
      const radius = 22 + Math.random() * 38;
      const theta = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const radial = Math.sqrt(1 - u * u);
      starPositions[index * 3] = radius * radial * Math.cos(theta);
      starPositions[index * 3 + 1] = radius * u;
      starPositions[index * 3 + 2] = radius * radial * Math.sin(theta);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: 0xded8ff,
        size: 0.055,
        transparent: true,
        opacity: 0.72,
        sizeAttenuation: true,
      }),
    );
    scene.add(stars);

    const system = new THREE.Group();
    system.rotation.z = -0.04;
    scene.add(system);

    const horizon = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 40),
      new THREE.MeshPhysicalMaterial({
        color: 0x010006,
        roughness: 0.12,
        metalness: 0.05,
        clearcoat: 0.32,
      }),
    );
    horizon.name = "outer-event-horizon-coordinate-surface";
    system.add(horizon);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.48, 0.085, 18, 160),
      new THREE.MeshBasicMaterial({
        color: 0xf7ecff,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.rotation.x = Math.PI / 2;
    system.add(halo);

    const ergoGeometry = new THREE.SphereGeometry(1, 46, 28);
    const ergoBase = new Float32Array(ergoGeometry.attributes.position.array as ArrayLike<number>);
    const ergosphere = new THREE.Mesh(
      ergoGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x9d7bff,
        wireframe: true,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    ergosphere.name = "outer-static-limit-coordinate-surface";
    system.add(ergosphere);

    const diskMaterial = createAccretionMaterial();
    const disk = new THREE.Mesh(new THREE.RingGeometry(1.28, 6.6, 192, 10), diskMaterial);
    disk.rotation.x = -Math.PI / 2;
    disk.name = "illustrative-accretion-disk";
    system.add(disk);

    const diskCore = new THREE.Mesh(
      new THREE.TorusGeometry(2.15, 0.06, 12, 180),
      new THREE.MeshBasicMaterial({
        color: 0xffd19c,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    diskCore.rotation.x = Math.PI / 2;
    system.add(diskCore);

    const jetMaterial = new THREE.MeshBasicMaterial({
      color: 0x7fdfff,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const upperJet = new THREE.Mesh(new THREE.ConeGeometry(0.82, 8, 40, 1, true), jetMaterial);
    upperJet.position.y = 4.4;
    const lowerJet = upperJet.clone();
    lowerJet.rotation.z = Math.PI;
    lowerJet.position.y = -4.4;
    system.add(upperJet, lowerJet);

    const orbitGuides = new THREE.Group();
    system.add(orbitGuides);
    const probeRoot = new THREE.Group();
    system.add(probeRoot);

    let currentProbeKind: ProbeKind | null = null;
    let currentProbe: THREE.Group | null = null;
    let lastGuideSignature = "";
    let elapsed = 0;
    let previousTime = performance.now();

    const updateCoordinateSurfaces = (currentSpin: number) => {
      const radii = kerrRadii(currentSpin);
      horizon.scale.setScalar(radiusToWorld(radii.horizonRg));
      halo.scale.setScalar(radiusToWorld(radii.horizonRg) / 1.15);
      const positions = ergoGeometry.attributes.position as THREE.BufferAttribute;
      for (let index = 0; index < positions.count; index += 1) {
        const x = ergoBase[index * 3];
        const y = ergoBase[index * 3 + 1];
        const z = ergoBase[index * 3 + 2];
        const length = Math.sqrt(x * x + y * y + z * z) || 1;
        const polarAngle = Math.acos(THREE.MathUtils.clamp(y / length, -1, 1));
        const radial = radiusToWorld(ergosphereRadiusRg(currentSpin, polarAngle));
        positions.setXYZ(index, (x / length) * radial, (y / length) * radial, (z / length) * radial);
      }
      positions.needsUpdate = true;
      ergoGeometry.computeVertexNormals();
    };

    const clearGroup = (group: THREE.Group) => {
      [...group.children].forEach((child) => {
        group.remove(child);
        disposeObject(child);
      });
    };

    const rebuildGuides = (currentSpin: number, currentDirection: OrbitDirection, selectedRadius: number) => {
      const radii = kerrRadii(currentSpin);
      const isco = currentDirection === "prograde" ? radii.progradeIscoRg : radii.retrogradeIscoRg;
      const photon = currentDirection === "prograde" ? radii.progradePhotonRg : radii.retrogradePhotonRg;
      const signature = `${currentSpin.toFixed(4)}-${currentDirection}-${selectedRadius.toFixed(3)}`;
      if (signature === lastGuideSignature) return;
      lastGuideSignature = signature;
      clearGroup(orbitGuides);
      orbitGuides.add(
        createOrbitLine(radii.staticLimitEquatorRg, 0xbfa4ff, 0.25),
        createOrbitLine(photon, 0xffc6f3, 0.7),
        createOrbitLine(isco, 0x71dfff, 0.58),
        createOrbitLine(selectedRadius, 0xffffff, 0.48),
      );
      updateCoordinateSurfaces(currentSpin);
    };

    const updateProbe = (kind: ProbeKind) => {
      if (kind === currentProbeKind && currentProbe) return;
      clearGroup(probeRoot);
      currentProbeKind = kind;
      currentProbe = createProbe(kind);
      probeRoot.add(currentProbe);
    };

    const updateCamera = () => {
      const orbit = cameraOrbitRef.current;
      const horizontal = Math.cos(orbit.pitch) * orbit.distance;
      camera.position.set(
        Math.sin(orbit.yaw) * horizontal,
        Math.sin(orbit.pitch) * orbit.distance,
        Math.cos(orbit.yaw) * horizontal,
      );
      camera.lookAt(cameraTarget);
    };

    setViewRef.current = (name: string) => {
      if (name === "Polar") cameraOrbitRef.current = { yaw: 0.15, pitch: 1.48, distance: 14 };
      else if (name === "Edge") cameraOrbitRef.current = { yaw: Math.PI / 2, pitch: 0.03, distance: 14 };
      else if (name === "Front") cameraOrbitRef.current = { yaw: 0.03, pitch: 0.18, distance: 14 };
      else cameraOrbitRef.current = { yaw: 0.72, pitch: 0.34, distance: 13.5 };
      setViewName(name);
      updateCamera();
    };
    zoomRef.current = (delta: number) => {
      cameraOrbitRef.current.distance = THREE.MathUtils.clamp(
        cameraOrbitRef.current.distance + delta,
        7,
        27,
      );
      setViewName("Custom");
      updateCamera();
    };
    updateCamera();

    let dragging = false;
    let pointerX = 0;
    let pointerY = 0;
    const canvas = renderer.domElement;
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      pointerX = event.clientX;
      pointerY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const orbit = cameraOrbitRef.current;
      orbit.yaw -= (event.clientX - pointerX) * 0.006;
      orbit.pitch = THREE.MathUtils.clamp(
        orbit.pitch + (event.clientY - pointerY) * 0.005,
        -1.45,
        1.48,
      );
      pointerX = event.clientX;
      pointerY = event.clientY;
      setViewName("Custom");
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomRef.current(event.deltaY * 0.01);
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLostRef.current = true;
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setWebglError(true);
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("webglcontextlost", onContextLost);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const animate = (time: number) => {
      animationFrameRef.current = null;
      if (!settingsRef.current.active) return;
      const delta = Math.min(0.05, Math.max(0, (time - previousTime) / 1_000));
      previousTime = time;
      const settings = settingsRef.current;
      if (settings.active && settings.playing) elapsed += delta * settings.speed;

      rebuildGuides(settings.spin, settings.direction, settings.radiusRg);
      updateProbe(settings.probeKind);
      diskMaterial.uniforms.time.value = elapsed;
      disk.rotation.y = elapsed * (0.055 + settings.spin * 0.12);
      diskCore.rotation.y = -elapsed * 0.08;
      stars.rotation.y = elapsed * 0.003;

      const radii = kerrRadii(settings.spin);
      const directionSign = settings.direction === "prograde" ? 1 : -1;
      const orbitPhase = elapsed * directionSign * 0.62;
      const selectedWorld = radiusToWorld(settings.radiusRg);
      const horizonWorld = radiusToWorld(radii.horizonRg) * 1.03;
      let animatedRadius = selectedWorld;
      let y = 0;

      if (settings.animationMode === "plunge") {
        const progress = (elapsed * 0.16) % 1;
        animatedRadius = THREE.MathUtils.lerp(selectedWorld, horizonWorld, progress * progress);
        y = Math.sin(progress * Math.PI * 3) * (1 - progress) * 0.12;
      } else if (settings.animationMode === "precess") {
        animatedRadius = selectedWorld * (0.94 + Math.sin(elapsed * 1.7) * 0.055);
        y = Math.sin(elapsed * 1.2) * 0.08;
      } else if (settings.animationMode === "photon") {
        y = Math.sin(elapsed * 2.4) * 0.025;
      }

      probeRoot.position.set(
        Math.cos(orbitPhase) * animatedRadius,
        y,
        Math.sin(orbitPhase) * animatedRadius,
      );
      probeRoot.rotation.y = -orbitPhase + (directionSign > 0 ? Math.PI / 2 : -Math.PI / 2);
      probeRoot.rotation.z = settings.animationMode === "precess" ? Math.sin(elapsed * 2) * 0.15 : 0;

      const pulse = 1 + Math.sin(elapsed * 2.1) * 0.045;
      halo.scale.multiplyScalar(pulse / (halo.userData.previousPulse ?? 1));
      halo.userData.previousPulse = pulse;
      ergosphere.rotation.y = elapsed * settings.spin * 0.09;
      updateCamera();
      renderer.render(scene, camera);
      animationFrameRef.current = window.requestAnimationFrame(animate);
    };
    renderLoopRef.current = animate;
    if (settingsRef.current.active && !contextLostRef.current) {
      animationFrameRef.current = window.requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      renderLoopRef.current = null;
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return (
    <div className={styles.sceneShell}>
      <div ref={mountRef} className={styles.sceneCanvas}>
        {webglError ? (
          <div className={styles.webglFallback} role="status">
            <strong>3D view unavailable</strong>
            <span>
              The calculations and radial map remain usable. Enable WebGL or try
              a browser with hardware acceleration for the interactive scene.
            </span>
          </div>
        ) : null}
      </div>
      <div className={styles.sceneTopline} aria-hidden="true">
        <span>Coordinate model</span>
        <span>Kerr · axisymmetric · uncharged</span>
      </div>
      <div className={styles.sceneLegend} aria-label="Scene legend">
        <span><i className={styles.legendHorizon} />Event horizon</span>
        <span><i className={styles.legendErgo} />Ergosurface</span>
        <span><i className={styles.legendPhoton} />Photon orbit</span>
        <span><i className={styles.legendIsco} />ISCO</span>
      </div>
      <div className={styles.cameraControls} aria-label="Black hole camera views">
        {(["Front", "Edge", "Polar", "Oblique"] as const).map((name) => (
          <button
            type="button"
            key={name}
            aria-pressed={viewName === name}
            onClick={() => setViewRef.current(name)}
          >
            {name}
          </button>
        ))}
        <button type="button" aria-label="Zoom out" onClick={() => zoomRef.current(1.5)}>−</button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomRef.current(-1.5)}>+</button>
      </div>
      <p className={styles.sceneDisclosure}>
        Drag to orbit · wheel, trackpad, or buttons to zoom · emission is illustrative, not ray-traced
      </p>
    </div>
  );
}
