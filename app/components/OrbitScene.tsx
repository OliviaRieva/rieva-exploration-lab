"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

export interface OrbitSceneSample {
  timeS: number;
  xM: number;
  yM: number;
  zM?: number;
  vxMps?: number;
  vyMps?: number;
  vzMps?: number;
  thrustN?: number;
}

export interface OrbitSceneOutage {
  startS: number;
  endS: number;
}

export interface OrbitSceneProps {
  reference: readonly OrbitSceneSample[];
  interrupted: readonly OrbitSceneSample[];
  currentTimeS: number;
  targetRadiusM: number;
  earthRadiusM?: number;
  outage?: OrbitSceneOutage;
  isPlaying?: boolean;
  className?: string;
}

type ViewMode = "top" | "oblique" | "custom";

interface CameraState {
  yaw: number;
  pitch: number;
  zoom: number;
}

interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
}

interface ScenePoint {
  x: number;
  y: number;
  z: number;
}

interface Projection {
  centerX: number;
  centerY: number;
  scale: number;
  maxRadius: number;
  yaw: number;
  pitch: number;
}

const TAU = Math.PI * 2;
const DEFAULT_EARTH_RADIUS_M = 6_371_000;
const CYAN = "#70deef";
const AMBER = "#ffb85c";
const PALE = "#d9f4fb";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function radiusOf(sample: OrbitSceneSample) {
  return Math.hypot(sample.xM, sample.yM, sample.zM ?? 0);
}

function finiteSample(sample: OrbitSceneSample) {
  return (
    Number.isFinite(sample.timeS) &&
    Number.isFinite(sample.xM) &&
    Number.isFinite(sample.yM) &&
    Number.isFinite(sample.zM ?? 0)
  );
}

function interpolateSample(
  samples: readonly OrbitSceneSample[],
  timeS: number,
): OrbitSceneSample | null {
  if (samples.length === 0) return null;
  if (timeS <= samples[0].timeS) return samples[0];
  if (timeS >= samples[samples.length - 1].timeS) {
    return samples[samples.length - 1];
  }

  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].timeS <= timeS) low = middle;
    else high = middle;
  }

  const start = samples[low];
  const end = samples[high];
  const span = end.timeS - start.timeS;
  const mix = span > 0 ? clamp((timeS - start.timeS) / span, 0, 1) : 0;
  const blend = (a: number | undefined, b: number | undefined) => {
    if (a === undefined && b === undefined) return undefined;
    const from = a ?? b ?? 0;
    const to = b ?? a ?? 0;
    return from + (to - from) * mix;
  };

  return {
    timeS,
    xM: start.xM + (end.xM - start.xM) * mix,
    yM: start.yM + (end.yM - start.yM) * mix,
    zM: blend(start.zM, end.zM),
    vxMps: blend(start.vxMps, end.vxMps),
    vyMps: blend(start.vyMps, end.vyMps),
    vzMps: blend(start.vzMps, end.vzMps),
    thrustN: blend(start.thrustN, end.thrustN),
  };
}

function samplesThrough(
  samples: readonly OrbitSceneSample[],
  timeS: number,
  maximumPoints = 850,
) {
  if (samples.length === 0) return [];
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].timeS <= timeS) low = middle + 1;
    else high = middle;
  }

  const count = Math.max(1, low);
  const stride = Math.max(1, Math.ceil(count / maximumPoints));
  const result: OrbitSceneSample[] = [];
  for (let index = 0; index < count; index += stride) {
    const sample = samples[index];
    if (finiteSample(sample)) result.push(sample);
  }
  const last = samples[count - 1];
  if (last && result[result.length - 1] !== last && finiteSample(last)) {
    result.push(last);
  }
  return result;
}

function projectPoint(point: ScenePoint, projection: Projection): ProjectedPoint {
  const cosYaw = Math.cos(projection.yaw);
  const sinYaw = Math.sin(projection.yaw);
  const cosPitch = Math.cos(projection.pitch);
  const sinPitch = Math.sin(projection.pitch);
  const yawX = point.x * cosYaw - point.y * sinYaw;
  const yawY = point.x * sinYaw + point.y * cosYaw;
  const viewY = yawY * cosPitch - point.z * sinPitch;
  const depth = yawY * sinPitch + point.z * cosPitch;
  const perspective = clamp(
    1 / (1 - (depth / projection.maxRadius) * 0.13),
    0.82,
    1.2,
  );

  return {
    x: projection.centerX + yawX * projection.scale * perspective,
    y: projection.centerY - viewY * projection.scale * perspective,
    depth,
  };
}

function projectSample(sample: OrbitSceneSample, projection: Projection) {
  return projectPoint(
    { x: sample.xM, y: sample.yM, z: sample.zM ?? 0 },
    projection,
  );
}

function drawSegmentPass(
  context: CanvasRenderingContext2D,
  points: readonly ProjectedPoint[],
  front: boolean,
  stroke: string,
  width: number,
  dash: readonly number[] = [],
  alpha = 1,
) {
  if (points.length < 2) return;
  context.save();
  context.beginPath();
  context.strokeStyle = stroke;
  context.lineWidth = width;
  context.globalAlpha = alpha;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.setLineDash([...dash]);
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const isFront = (previous.depth + current.depth) / 2 >= 0;
    if (isFront === front) {
      context.moveTo(previous.x, previous.y);
      context.lineTo(current.x, current.y);
    }
  }
  context.stroke();
  context.restore();
}

function ringPoints(radiusM: number, projection: Projection, count = 180) {
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = (index / count) * TAU;
    return projectPoint(
      { x: Math.cos(angle) * radiusM, y: Math.sin(angle) * radiusM, z: 0 },
      projection,
    );
  });
}

function drawEarthGrid(
  context: CanvasRenderingContext2D,
  earthRadiusM: number,
  projection: Projection,
  earthRotation: number,
) {
  context.save();
  context.strokeStyle = "rgba(164, 226, 238, 0.2)";
  context.lineWidth = 0.7;
  const sampleCount = 96;

  for (let latitudeIndex = -2; latitudeIndex <= 2; latitudeIndex += 1) {
    const latitude = (latitudeIndex * Math.PI) / 10;
    const latitudeRadius = Math.cos(latitude) * earthRadiusM;
    const z = Math.sin(latitude) * earthRadiusM;
    const points: ProjectedPoint[] = [];
    for (let index = 0; index <= sampleCount; index += 1) {
      const longitude = (index / sampleCount) * TAU + earthRotation;
      points.push(
        projectPoint(
          {
            x: Math.cos(longitude) * latitudeRadius,
            y: Math.sin(longitude) * latitudeRadius,
            z,
          },
          projection,
        ),
      );
    }
    drawSegmentPass(context, points, true, "rgba(164, 226, 238, 0.2)", 0.7);
  }

  for (let longitudeIndex = 0; longitudeIndex < 12; longitudeIndex += 1) {
    const longitude = (longitudeIndex / 12) * TAU + earthRotation;
    const points: ProjectedPoint[] = [];
    for (let index = 0; index <= sampleCount; index += 1) {
      const latitude = -Math.PI / 2 + (index / sampleCount) * Math.PI;
      const latitudeRadius = Math.cos(latitude) * earthRadiusM;
      points.push(
        projectPoint(
          {
            x: Math.cos(longitude) * latitudeRadius,
            y: Math.sin(longitude) * latitudeRadius,
            z: Math.sin(latitude) * earthRadiusM,
          },
          projection,
        ),
      );
    }
    drawSegmentPass(context, points, true, "rgba(164, 226, 238, 0.17)", 0.7);
  }
  context.restore();
}

function directionFor(
  sample: OrbitSceneSample,
): { x: number; y: number; z: number } {
  const velocityLength = Math.hypot(
    sample.vxMps ?? 0,
    sample.vyMps ?? 0,
    sample.vzMps ?? 0,
  );
  if (velocityLength > 0) {
    return {
      x: (sample.vxMps ?? 0) / velocityLength,
      y: (sample.vyMps ?? 0) / velocityLength,
      z: (sample.vzMps ?? 0) / velocityLength,
    };
  }
  const radius = Math.hypot(sample.xM, sample.yM) || 1;
  return { x: -sample.yM / radius, y: sample.xM / radius, z: 0 };
}

function isOcculted(
  point: ProjectedPoint,
  projection: Projection,
  earthScreenRadius: number,
) {
  return (
    point.depth < 0 &&
    Math.hypot(point.x - projection.centerX, point.y - projection.centerY) <
      earthScreenRadius * 0.97
  );
}

function drawSpacecraft(
  context: CanvasRenderingContext2D,
  sample: OrbitSceneSample | null,
  projection: Projection,
  earthScreenRadius: number,
  color: string,
  label: string,
  filled: boolean,
) {
  if (!sample) return;
  const point = projectSample(sample, projection);
  if (isOcculted(point, projection, earthScreenRadius)) return;

  const direction = directionFor(sample);
  const ahead = projectPoint(
    {
      x: sample.xM + direction.x * projection.maxRadius * 0.025,
      y: sample.yM + direction.y * projection.maxRadius * 0.025,
      z: (sample.zM ?? 0) + direction.z * projection.maxRadius * 0.025,
    },
    projection,
  );
  const screenLength = Math.hypot(ahead.x - point.x, ahead.y - point.y) || 1;
  const dx = (ahead.x - point.x) / screenLength;
  const dy = (ahead.y - point.y) / screenLength;
  const nx = -dy;
  const ny = dx;

  if ((sample.thrustN ?? 0) > 1e-10) {
    const thrustLength = 30;
    const tipX = point.x + dx * thrustLength;
    const tipY = point.y + dy * thrustLength;
    context.save();
    context.strokeStyle = color;
    context.fillStyle = color;
    context.globalAlpha = 0.72;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(point.x + dx * 7, point.y + dy * 7);
    context.lineTo(tipX, tipY);
    context.stroke();
    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(tipX - dx * 6 + nx * 3, tipY - dy * 6 + ny * 3);
    context.lineTo(tipX - dx * 6 - nx * 3, tipY - dy * 6 - ny * 3);
    context.closePath();
    context.fill();
    context.restore();
  }

  context.save();
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.strokeStyle = color;
  context.fillStyle = filled ? color : "#071522";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(point.x + dx * 7, point.y + dy * 7);
  context.lineTo(point.x - dx * 5 + nx * 4.5, point.y - dy * 5 + ny * 4.5);
  context.lineTo(point.x - dx * 3, point.y - dy * 3);
  context.lineTo(point.x - dx * 5 - nx * 4.5, point.y - dy * 5 - ny * 4.5);
  context.closePath();
  context.fill();
  context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = "rgba(234, 247, 255, 0.82)";
  context.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText(label, point.x + 10, point.y - 9);
  context.restore();
}

function drawScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: {
    reference: readonly OrbitSceneSample[];
    interrupted: readonly OrbitSceneSample[];
    referenceCurrent: OrbitSceneSample | null;
    interruptedCurrent: OrbitSceneSample | null;
    currentTimeS: number;
    earthRadiusM: number;
    targetRadiusM: number;
    outage?: OrbitSceneOutage;
    maxRadius: number;
    camera: CameraState;
    follow: boolean;
  },
) {
  context.clearRect(0, 0, width, height);
  const backdrop = context.createRadialGradient(
    width * 0.48,
    height * 0.42,
    0,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.8,
  );
  backdrop.addColorStop(0, "#0a1a28");
  backdrop.addColorStop(0.55, "#06101c");
  backdrop.addColorStop(1, "#030812");
  context.fillStyle = backdrop;
  context.fillRect(0, 0, width, height);

  context.save();
  for (let index = 0; index < 90; index += 1) {
    const x = (((index * 577) % 997) / 997) * width;
    const y = (((index * 293 + 71) % 991) / 991) * height;
    const radius = index % 11 === 0 ? 1.05 : 0.55;
    context.fillStyle = index % 7 === 0 ? "rgba(112, 222, 239, 0.55)" : "rgba(226, 241, 247, 0.32)";
    context.beginPath();
    context.arc(x, y, radius, 0, TAU);
    context.fill();
  }
  context.restore();

  const followed = options.interruptedCurrent ?? options.referenceCurrent;
  const followYaw =
    options.follow && followed
      ? -Math.atan2(followed.yM, followed.xM) + Math.PI / 2
      : 0;
  const usableRadius = Math.min(width * 0.44, height * 0.43);
  const projection: Projection = {
    centerX: width / 2,
    centerY: height / 2 + Math.min(18, height * 0.025),
    scale: (usableRadius / options.maxRadius) * options.camera.zoom,
    maxRadius: options.maxRadius,
    yaw: options.camera.yaw + followYaw,
    pitch: options.camera.pitch,
  };

  const targetRing = ringPoints(options.targetRadiusM, projection);
  const initialRadius =
    options.reference[0] && finiteSample(options.reference[0])
      ? radiusOf(options.reference[0])
      : options.interrupted[0] && finiteSample(options.interrupted[0])
        ? radiusOf(options.interrupted[0])
        : 0;
  const initialRing = initialRadius > 0 ? ringPoints(initialRadius, projection) : [];
  const referencePoints = samplesThrough(
    options.reference,
    options.currentTimeS,
  ).map((sample) => projectSample(sample, projection));
  const interruptedSamples = samplesThrough(
    options.interrupted,
    options.currentTimeS,
  );
  const interruptedPoints = interruptedSamples.map((sample) =>
    projectSample(sample, projection),
  );

  drawSegmentPass(context, targetRing, false, PALE, 1.1, [6, 7], 0.34);
  drawSegmentPass(context, initialRing, false, CYAN, 0.8, [2, 6], 0.2);
  drawSegmentPass(context, referencePoints, false, CYAN, 1.8, [], 0.36);
  drawSegmentPass(context, interruptedPoints, false, AMBER, 1.8, [7, 5], 0.36);

  if (options.outage) {
    const outagePoints = interruptedSamples
      .filter(
        (sample) =>
          sample.timeS >= options.outage!.startS &&
          sample.timeS <= options.outage!.endS,
      )
      .map((sample) => projectSample(sample, projection));
    drawSegmentPass(context, outagePoints, false, AMBER, 5, [], 0.12);
  }

  const earthScreenRadius = options.earthRadiusM * projection.scale;
  const atmosphere = context.createRadialGradient(
    projection.centerX,
    projection.centerY,
    earthScreenRadius * 0.86,
    projection.centerX,
    projection.centerY,
    earthScreenRadius * 1.18,
  );
  atmosphere.addColorStop(0, "rgba(45, 183, 220, 0.08)");
  atmosphere.addColorStop(0.72, "rgba(67, 205, 235, 0.18)");
  atmosphere.addColorStop(1, "rgba(67, 205, 235, 0)");
  context.fillStyle = atmosphere;
  context.beginPath();
  context.arc(
    projection.centerX,
    projection.centerY,
    earthScreenRadius * 1.2,
    0,
    TAU,
  );
  context.fill();

  const earth = context.createRadialGradient(
    projection.centerX - earthScreenRadius * 0.3,
    projection.centerY - earthScreenRadius * 0.32,
    earthScreenRadius * 0.08,
    projection.centerX,
    projection.centerY,
    earthScreenRadius,
  );
  earth.addColorStop(0, "#1c758e");
  earth.addColorStop(0.42, "#0d485f");
  earth.addColorStop(0.76, "#082c42");
  earth.addColorStop(1, "#03131f");
  context.fillStyle = earth;
  context.strokeStyle = "rgba(112, 222, 239, 0.62)";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(
    projection.centerX,
    projection.centerY,
    earthScreenRadius,
    0,
    TAU,
  );
  context.fill();
  context.stroke();

  drawEarthGrid(
    context,
    options.earthRadiusM,
    projection,
    (options.currentTimeS / 86_164) * TAU,
  );

  drawSegmentPass(context, targetRing, true, PALE, 1.35, [6, 7], 0.7);
  drawSegmentPass(context, initialRing, true, CYAN, 0.9, [2, 6], 0.34);
  drawSegmentPass(context, referencePoints, true, CYAN, 2.1, [], 0.92);
  drawSegmentPass(context, interruptedPoints, true, AMBER, 2.1, [7, 5], 0.92);

  if (options.outage) {
    const outagePoints = interruptedSamples
      .filter(
        (sample) =>
          sample.timeS >= options.outage!.startS &&
          sample.timeS <= options.outage!.endS,
      )
      .map((sample) => projectSample(sample, projection));
    drawSegmentPass(context, outagePoints, true, AMBER, 5, [], 0.17);
  }

  drawSpacecraft(
    context,
    options.referenceCurrent,
    projection,
    earthScreenRadius,
    CYAN,
    "REF",
    false,
  );
  drawSpacecraft(
    context,
    options.interruptedCurrent,
    projection,
    earthScreenRadius,
    AMBER,
    "INT",
    true,
  );

  context.save();
  context.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillStyle = "rgba(218, 240, 247, 0.62)";
  context.textAlign = "right";
  context.fillText(
    `TARGET +${Math.max(0, (options.targetRadiusM - options.earthRadiusM) / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} KM`,
    width - 16,
    height - 16,
  );
  context.restore();
}

function formatSceneSummary(
  timeS: number,
  reference: OrbitSceneSample | null,
  interrupted: OrbitSceneSample | null,
  earthRadiusM: number,
) {
  const day = timeS / 86_400;
  const altitude = (sample: OrbitSceneSample | null) =>
    sample ? (radiusOf(sample) - earthRadiusM) / 1000 : null;
  const referenceAltitude = altitude(reference);
  const interruptedAltitude = altitude(interrupted);

  if (referenceAltitude === null && interruptedAltitude === null) {
    return "No propagated trajectory is available yet.";
  }

  const values = [
    `Mission day ${day.toFixed(day < 10 ? 2 : 1)}`,
    referenceAltitude === null
      ? null
      : `reference altitude ${referenceAltitude.toLocaleString(undefined, { maximumFractionDigits: 0 })} kilometres`,
    interruptedAltitude === null
      ? null
      : `interrupted altitude ${interruptedAltitude.toLocaleString(undefined, { maximumFractionDigits: 0 })} kilometres`,
  ].filter(Boolean);
  return `${values.join(", ")}.`;
}

export function OrbitScene({
  reference,
  interrupted,
  currentTimeS,
  targetRadiusM,
  earthRadiusM = DEFAULT_EARTH_RADIUS_M,
  outage,
  isPlaying = false,
  className = "",
}: OrbitSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const instructionsId = useId();
  const [camera, setCamera] = useState<CameraState>({
    yaw: 0.18,
    pitch: 0.72,
    zoom: 1,
  });
  const [viewMode, setViewMode] = useState<ViewMode>("oblique");
  const [follow, setFollow] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0, dpr: 1 });

  const referenceCurrent = useMemo(
    () => interpolateSample(reference, currentTimeS),
    [reference, currentTimeS],
  );
  const interruptedCurrent = useMemo(
    () => interpolateSample(interrupted, currentTimeS),
    [interrupted, currentTimeS],
  );
  const maxRadius = useMemo(() => {
    let maximum = Math.max(targetRadiusM, earthRadiusM * 1.15);
    for (const sample of reference) {
      if (finiteSample(sample)) maximum = Math.max(maximum, radiusOf(sample));
    }
    for (const sample of interrupted) {
      if (finiteSample(sample)) maximum = Math.max(maximum, radiusOf(sample));
    }
    return Math.max(maximum, 1);
  }, [earthRadiusM, interrupted, reference, targetRadiusM]);

  const summary = useMemo(
    () =>
      formatSceneSummary(
        currentTimeS,
        referenceCurrent,
        interruptedCurrent,
        earthRadiusM,
      ),
    [currentTimeS, earthRadiusM, interruptedCurrent, referenceCurrent],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      setViewport((previous) =>
        previous.width === width &&
        previous.height === height &&
        previous.dpr === dpr
          ? previous
          : { width, height, dpr },
      );
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width <= 0 || viewport.height <= 0) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    drawScene(context, viewport.width, viewport.height, {
      reference,
      interrupted,
      referenceCurrent,
      interruptedCurrent,
      currentTimeS,
      earthRadiusM,
      targetRadiusM,
      outage,
      maxRadius,
      camera,
      follow,
    });
  }, [
    camera,
    currentTimeS,
    earthRadiusM,
    follow,
    interrupted,
    interruptedCurrent,
    maxRadius,
    outage,
    reference,
    referenceCurrent,
    targetRadiusM,
    viewport,
  ]);

  const selectTopView = () => {
    setCamera((previous) => ({ ...previous, yaw: 0, pitch: 0 }));
    setFollow(false);
    setViewMode("top");
  };

  const selectObliqueView = () => {
    setCamera((previous) => ({ ...previous, yaw: 0.18, pitch: 0.72 }));
    setFollow(false);
    setViewMode("oblique");
  };

  const resetView = () => {
    setCamera({ yaw: 0.18, pitch: 0.72, zoom: 1 });
    setFollow(false);
    setViewMode("oblique");
  };

  const adjustZoom = (factor: number) => {
    setCamera((previous) => ({
      ...previous,
      zoom: clamp(previous.zoom * factor, 0.62, 3.2),
    }));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
    setFollow(false);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const previous = dragRef.current;
    if (!previous) return;
    const deltaX = event.clientX - previous.x;
    const deltaY = event.clientY - previous.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setCamera((value) => ({
      ...value,
      yaw: value.yaw + deltaX * 0.007,
      pitch: clamp(value.pitch + deltaY * 0.006, 0, 1.35),
    }));
    setViewMode("custom");
  };

  const stopDragging = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    adjustZoom(Math.exp(-event.deltaY * 0.0012));
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const rotationStep = event.shiftKey ? 0.18 : 0.08;
    let handled = true;
    switch (event.key) {
      case "ArrowLeft":
        setCamera((value) => ({ ...value, yaw: value.yaw - rotationStep }));
        setViewMode("custom");
        setFollow(false);
        break;
      case "ArrowRight":
        setCamera((value) => ({ ...value, yaw: value.yaw + rotationStep }));
        setViewMode("custom");
        setFollow(false);
        break;
      case "ArrowUp":
        setCamera((value) => ({
          ...value,
          pitch: clamp(value.pitch - rotationStep, 0, 1.35),
        }));
        setViewMode("custom");
        setFollow(false);
        break;
      case "ArrowDown":
        setCamera((value) => ({
          ...value,
          pitch: clamp(value.pitch + rotationStep, 0, 1.35),
        }));
        setViewMode("custom");
        setFollow(false);
        break;
      case "+":
      case "=":
        adjustZoom(1.12);
        break;
      case "-":
      case "_":
        adjustZoom(1 / 1.12);
        break;
      case "r":
      case "R":
        resetView();
        break;
      case "f":
      case "F":
        setFollow((value) => !value);
        break;
      default:
        handled = false;
    }
    if (handled) event.preventDefault();
  };

  return (
    <section
      className={`orbit-scene ${className}`.trim()}
      aria-label="Interactive three-dimensional mission view"
    >
      <div className="orbit-scene__toolbar" aria-label="Mission view controls">
        <div className="orbit-scene__view-group" role="group" aria-label="Camera angle">
          <button
            type="button"
            className="orbit-scene__control"
            aria-pressed={viewMode === "top"}
            onClick={selectTopView}
          >
            Top
          </button>
          <button
            type="button"
            className="orbit-scene__control"
            aria-pressed={viewMode === "oblique"}
            onClick={selectObliqueView}
          >
            Oblique
          </button>
          <button
            type="button"
            className="orbit-scene__control"
            aria-pressed={follow}
            onClick={() => setFollow((value) => !value)}
          >
            Follow spacecraft
          </button>
          <button
            type="button"
            className="orbit-scene__control"
            onClick={resetView}
          >
            Reset view
          </button>
        </div>
        <div className="orbit-scene__zoom-group" role="group" aria-label="Camera zoom">
          <button
            type="button"
            className="orbit-scene__control orbit-scene__zoom-control"
            aria-label="Zoom out"
            onClick={() => adjustZoom(1 / 1.12)}
          >
            −
          </button>
          <span className="orbit-scene__zoom-value" aria-hidden="true">
            {Math.round(camera.zoom * 100)}%
          </span>
          <button
            type="button"
            className="orbit-scene__control orbit-scene__zoom-control"
            aria-label="Zoom in"
            onClick={() => adjustZoom(1.12)}
          >
            +
          </button>
        </div>
      </div>

      <div className="orbit-scene__viewport">
        <canvas
          ref={canvasRef}
          className="orbit-scene__canvas"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            minHeight: "420px",
            touchAction: "none",
          }}
          tabIndex={0}
          role="img"
          aria-label={`${summary} Cyan is the reference trajectory; dashed amber is the interrupted trajectory. The view is visually three-dimensional while the propagated dynamics are planar.`}
          aria-describedby={instructionsId}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
        />
        <div className="orbit-scene__legend" aria-label="Trajectory legend">
          <span className="orbit-scene__legend-item orbit-scene__legend-item--reference">
            Reference
          </span>
          <span className="orbit-scene__legend-item orbit-scene__legend-item--interrupted">
            Interrupted
          </span>
          <span className="orbit-scene__legend-item orbit-scene__legend-item--target">
            Target orbit
          </span>
        </div>
        <span className="orbit-scene__model-badge">3D view · planar dynamics</span>
      </div>

      <div className="orbit-scene__footer">
        <p id={instructionsId} className="orbit-scene__instructions">
          Drag to rotate · Scroll to zoom · Arrow keys rotate · +/− zoom · R reset · F follow
        </p>
        <p className="orbit-scene__summary">
          <span className="orbit-scene__state" aria-hidden="true">
            {isPlaying
              ? "Playing"
              : reference.length > 0 || interrupted.length > 0
                ? "Paused"
                : "Ready"}
          </span>{" "}
          {summary}
        </p>
      </div>
    </section>
  );
}

export default OrbitScene;
