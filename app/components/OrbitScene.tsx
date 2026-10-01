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
import type { SpacecraftDesignId } from "../../lib/orbital/catalog";

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
  bodyName?: string;
  bodyVisual?: {
    light: string;
    mid: string;
    dark: string;
    atmosphere: string;
  };
  solarDistanceAu?: number;
  bodyRotationPeriodS?: number;
  spacecraftDesign?: SpacecraftDesignId;
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
const RECENT_TRAIL_DURATION_S = 6 * 60 * 60;
const MAX_HISTORY_MARKERS = 720;
const MAX_RECENT_TRAIL_POINTS = 420;
const DEFAULT_BODY_VISUAL = {
  light: "#74e4ff",
  mid: "#247db8",
  dark: "#09274c",
  atmosphere: "rgba(94, 210, 255, 0.26)",
};

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

interface TrailSelection {
  history: OrbitSceneSample[];
  recent: OrbitSceneSample[];
}

function trailSamplesThrough(
  samples: readonly OrbitSceneSample[],
  timeS: number,
  current: OrbitSceneSample | null,
): TrailSelection {
  if (samples.length === 0) return { history: [], recent: [] };
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].timeS <= timeS) low = middle + 1;
    else high = middle;
  }

  const count = low;
  if (count === 0) return { history: [], recent: [] };

  const recentStartS = Math.max(0, timeS - RECENT_TRAIL_DURATION_S);
  let recentStartIndex = 0;
  let recentHigh = count;
  while (recentStartIndex < recentHigh) {
    const middle = Math.floor((recentStartIndex + recentHigh) / 2);
    if (samples[middle].timeS < recentStartS) recentStartIndex = middle + 1;
    else recentHigh = middle;
  }

  const history: OrbitSceneSample[] = [];
  const historyStride = Math.max(
    1,
    Math.ceil(Math.max(0, recentStartIndex) / MAX_HISTORY_MARKERS),
  );
  for (let index = 0; index < recentStartIndex; index += historyStride) {
    const sample = samples[index];
    if (finiteSample(sample)) history.push(sample);
  }
  const lastHistory = samples[recentStartIndex - 1];
  if (
    lastHistory &&
    history[history.length - 1] !== lastHistory &&
    finiteSample(lastHistory)
  ) {
    history.push(lastHistory);
  }

  const recent: OrbitSceneSample[] = [];
  const recentCount = count - recentStartIndex;
  const recentStride = Math.max(
    1,
    Math.ceil(recentCount / MAX_RECENT_TRAIL_POINTS),
  );
  for (let index = recentStartIndex; index < count; index += recentStride) {
    const sample = samples[index];
    if (finiteSample(sample)) recent.push(sample);
  }
  const latest = samples[count - 1];
  if (latest && recent[recent.length - 1] !== latest && finiteSample(latest)) {
    recent.push(latest);
  }
  if (
    current &&
    finiteSample(current) &&
    recent[recent.length - 1]?.timeS !== current.timeS
  ) {
    recent.push(current);
  }

  return { history, recent };
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

function drawHistoryMarkers(
  context: CanvasRenderingContext2D,
  points: readonly ProjectedPoint[],
  front: boolean,
  color: string,
  shape: "circle" | "diamond",
) {
  if (points.length === 0) return;
  context.save();
  context.fillStyle = color;
  context.globalAlpha = front ? 0.2 : 0.075;
  for (const point of points) {
    if ((point.depth >= 0) !== front) continue;
    if (shape === "diamond") {
      context.beginPath();
      context.moveTo(point.x, point.y - 1.2);
      context.lineTo(point.x + 1.2, point.y);
      context.lineTo(point.x, point.y + 1.2);
      context.lineTo(point.x - 1.2, point.y);
      context.closePath();
      context.fill();
    } else {
      context.beginPath();
      context.arc(point.x, point.y, 0.9, 0, TAU);
      context.fill();
    }
  }
  context.restore();
}

function drawRecentTrail(
  context: CanvasRenderingContext2D,
  points: readonly ProjectedPoint[],
  front: boolean,
  color: string,
  dash: readonly number[] = [],
) {
  if (points.length < 2) return;
  const chunkCount = Math.min(8, points.length - 1);
  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    const start = Math.floor((chunk / chunkCount) * (points.length - 1));
    const end = Math.min(
      points.length,
      Math.ceil(((chunk + 1) / chunkCount) * (points.length - 1)) + 1,
    );
    const section = points.slice(start, end);
    const age = (chunk + 1) / chunkCount;
    const visibility = front ? 1 : 0.42;
    drawSegmentPass(
      context,
      section,
      front,
      color,
      6,
      dash,
      (0.025 + age * 0.075) * visibility,
    );
    drawSegmentPass(
      context,
      section,
      front,
      color,
      front ? 2.2 : 1.7,
      dash,
      (0.2 + age * 0.72) * visibility,
    );
  }
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
  accent: string,
  variant: "reference" | "interrupted",
  design: SpacecraftDesignId,
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
  const angle = Math.atan2(dy, dx);
  const isThrusting = (sample.thrustN ?? 0) > 1e-10;

  context.save();
  context.translate(point.x, point.y);
  context.rotate(angle);

  if (isThrusting) {
    const flicker = 1 + Math.sin(sample.timeS * 0.19) * 0.12;
    context.save();
    context.shadowColor = accent;
    context.shadowBlur = 12;
    context.fillStyle = accent;
    context.globalAlpha = 0.62;
    context.beginPath();
    context.moveTo(-7, -2.5);
    context.quadraticCurveTo(-16 * flicker, -4.5, -27 * flicker, 0);
    context.quadraticCurveTo(-16 * flicker, 4.5, -7, 2.5);
    context.closePath();
    context.fill();
    context.fillStyle = "#f8fcff";
    context.globalAlpha = 0.9;
    context.beginPath();
    context.moveTo(-7, -1.25);
    context.quadraticCurveTo(-13 * flicker, -2, -19 * flicker, 0);
    context.quadraticCurveTo(-13 * flicker, 2, -7, 1.25);
    context.closePath();
    context.fill();
    context.restore();

    context.save();
    context.fillStyle = accent;
    context.globalAlpha = 0.38;
    for (let particle = 0; particle < 6; particle += 1) {
      const drift = ((sample.timeS * 0.08 + particle * 1.71) % 1) * 24;
      const wobble = Math.sin(sample.timeS * 0.11 + particle * 2.3) * 3.3;
      context.beginPath();
      context.arc(-10 - drift, wobble, 0.55 + particle * 0.1, 0, TAU);
      context.fill();
    }
    context.restore();
  }

  context.save();
  context.strokeStyle = accent;
  context.globalAlpha = variant === "reference" ? 0.58 : 0.72;
  context.lineWidth = 1;
  context.setLineDash(variant === "interrupted" ? [2.5, 2.5] : []);
  context.beginPath();
  context.arc(0, 0, 13, 0, TAU);
  context.stroke();
  context.restore();

  context.shadowColor = accent;
  context.shadowBlur = 10;
  context.fillStyle = "#f8fcff";
  context.strokeStyle = "rgba(3, 13, 23, 0.92)";
  context.lineWidth = 1.1;

  if (design === "cargo-spiraler") {
    context.beginPath();
    context.roundRect(-7, -4.5, 15, 9, 2.5);
    context.fill();
    context.stroke();
    context.fillStyle = accent;
    context.globalAlpha = 0.78;
    context.fillRect(-4.5, -11, 9, 5);
    context.fillRect(-4.5, 6, 9, 5);
    context.globalAlpha = 1;
    context.fillStyle = "#f8fcff";
    context.beginPath();
    context.moveTo(12, 0);
    context.lineTo(7, -3.5);
    context.lineTo(7, 3.5);
    context.closePath();
    context.fill();
    context.stroke();
  } else if (design === "ion-scout") {
    context.beginPath();
    context.moveTo(11.5, 0);
    context.bezierCurveTo(5.5, -2.8, -1.5, -3.6, -8, -2.1);
    context.lineTo(-8, 2.1);
    context.bezierCurveTo(-1.5, 3.6, 5.5, 2.8, 11.5, 0);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = accent;
    context.globalAlpha = 0.72;
    context.fillRect(-5.5, -8.5, 6.5, 4.2);
    context.fillRect(-5.5, 4.3, 6.5, 4.2);
    context.globalAlpha = 1;
  } else {
    context.beginPath();
    context.moveTo(10, 0);
    context.bezierCurveTo(7.3, -3.5, 2.5, -4.7, -5.8, -3.2);
    context.lineTo(-7.2, -2.2);
    context.lineTo(-7.2, 2.2);
    context.lineTo(-5.8, 3.2);
    context.bezierCurveTo(2.5, 4.7, 7.3, 3.5, 10, 0);
    context.closePath();
    context.fill();
    context.stroke();

    context.beginPath();
    context.moveTo(-3.4, -3.4);
    context.lineTo(-7.5, -7.1);
    context.lineTo(-7, -2.2);
    context.closePath();
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(-3.4, 3.4);
    context.lineTo(-7.5, 7.1);
    context.lineTo(-7, 2.2);
    context.closePath();
    context.fill();
    context.stroke();
  }

  context.shadowBlur = 0;
  context.fillStyle = "#071522";
  context.strokeStyle = accent;
  context.lineWidth = 1;
  context.beginPath();
  context.arc(3.1, 0, 2, 0, TAU);
  context.fill();
  context.stroke();

  context.fillStyle = "#dce7ed";
  context.fillRect(-8.2, -2.1, 1.4, 4.2);
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
    bodyName: string;
    bodyVisual: typeof DEFAULT_BODY_VISUAL;
    solarDistanceAu: number;
    bodyRotationPeriodS: number;
    spacecraftDesign: SpacecraftDesignId;
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

  const sunRadius = clamp(12 / options.solarDistanceAu, 4, 24);
  const sunX = width * 0.86;
  const sunY = height * 0.15;
  const sunGlow = context.createRadialGradient(
    sunX,
    sunY,
    0,
    sunX,
    sunY,
    sunRadius * 4.2,
  );
  sunGlow.addColorStop(0, "rgba(255,255,238,0.98)");
  sunGlow.addColorStop(0.18, "rgba(255,216,137,0.72)");
  sunGlow.addColorStop(1, "rgba(255,181,96,0)");
  context.fillStyle = sunGlow;
  context.beginPath();
  context.arc(sunX, sunY, sunRadius * 4.2, 0, TAU);
  context.fill();
  context.fillStyle = "#fff8dc";
  context.beginPath();
  context.arc(sunX, sunY, sunRadius, 0, TAU);
  context.fill();

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
  const referenceTrail = trailSamplesThrough(
    options.reference,
    options.currentTimeS,
    options.referenceCurrent,
  );
  const interruptedTrail = trailSamplesThrough(
    options.interrupted,
    options.currentTimeS,
    options.interruptedCurrent,
  );
  const referenceHistoryPoints = referenceTrail.history.map((sample) =>
    projectSample(sample, projection),
  );
  const interruptedHistoryPoints = interruptedTrail.history.map((sample) =>
    projectSample(sample, projection),
  );
  const referenceRecentPoints = referenceTrail.recent.map((sample) =>
    projectSample(sample, projection),
  );
  const interruptedRecentPoints = interruptedTrail.recent.map((sample) =>
    projectSample(sample, projection),
  );
  const outageRecentPoints = options.outage
    ? interruptedTrail.recent
        .filter(
          (sample) =>
            sample.timeS >= options.outage!.startS &&
            sample.timeS <= options.outage!.endS,
        )
        .map((sample) => projectSample(sample, projection))
    : [];

  drawSegmentPass(context, targetRing, false, PALE, 1.1, [6, 7], 0.34);
  drawSegmentPass(context, initialRing, false, CYAN, 0.8, [2, 6], 0.2);
  drawHistoryMarkers(context, referenceHistoryPoints, false, CYAN, "circle");
  drawHistoryMarkers(
    context,
    interruptedHistoryPoints,
    false,
    AMBER,
    "diamond",
  );
  drawRecentTrail(context, referenceRecentPoints, false, CYAN);
  drawRecentTrail(context, interruptedRecentPoints, false, AMBER, [7, 5]);
  drawSegmentPass(context, outageRecentPoints, false, AMBER, 5, [], 0.1);

  const earthScreenRadius = options.earthRadiusM * projection.scale;
  const atmosphere = context.createRadialGradient(
    projection.centerX,
    projection.centerY,
    earthScreenRadius * 0.86,
    projection.centerX,
    projection.centerY,
    earthScreenRadius * 1.18,
  );
  atmosphere.addColorStop(0, options.bodyVisual.atmosphere);
  atmosphere.addColorStop(0.72, options.bodyVisual.atmosphere);
  atmosphere.addColorStop(1, "rgba(255, 255, 255, 0)");
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
  earth.addColorStop(0, options.bodyVisual.light);
  earth.addColorStop(0.42, options.bodyVisual.mid);
  earth.addColorStop(0.76, options.bodyVisual.dark);
  earth.addColorStop(1, "#070713");
  const saturnRing =
    options.bodyName === "Saturn"
      ? ringPoints(options.earthRadiusM * 1.72, projection, 220)
      : [];
  drawSegmentPass(
    context,
    saturnRing,
    false,
    "rgba(236, 214, 171, 0.42)",
    4.5,
    [],
    0.72,
  );
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
    (options.currentTimeS / options.bodyRotationPeriodS) * TAU,
  );
  drawSegmentPass(
    context,
    saturnRing,
    true,
    "rgba(255, 237, 192, 0.72)",
    5.2,
    [],
    0.9,
  );

  drawSegmentPass(context, targetRing, true, PALE, 1.35, [6, 7], 0.7);
  drawSegmentPass(context, initialRing, true, CYAN, 0.9, [2, 6], 0.34);
  drawHistoryMarkers(context, referenceHistoryPoints, true, CYAN, "circle");
  drawHistoryMarkers(
    context,
    interruptedHistoryPoints,
    true,
    AMBER,
    "diamond",
  );
  drawRecentTrail(context, referenceRecentPoints, true, CYAN);
  drawRecentTrail(context, interruptedRecentPoints, true, AMBER, [7, 5]);
  drawSegmentPass(context, outageRecentPoints, true, AMBER, 5, [], 0.16);

  drawSpacecraft(
    context,
    options.referenceCurrent,
    projection,
    earthScreenRadius,
    CYAN,
    "reference",
    options.spacecraftDesign,
  );
  drawSpacecraft(
    context,
    options.interruptedCurrent,
    projection,
    earthScreenRadius,
    AMBER,
    "interrupted",
    options.spacecraftDesign,
  );

  context.save();
  context.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillStyle = "rgba(218, 240, 247, 0.62)";
  context.textAlign = "right";
  context.fillText(
    `${options.bodyName.toUpperCase()} TARGET ${Math.max(0, (options.targetRadiusM - options.earthRadiusM) / 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })} KM`,
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
      : `reference altitude ${referenceAltitude.toLocaleString("en-US", { maximumFractionDigits: 0 })} kilometres`,
    interruptedAltitude === null
      ? null
      : `interrupted altitude ${interruptedAltitude.toLocaleString("en-US", { maximumFractionDigits: 0 })} kilometres`,
  ].filter(Boolean);
  return `${values.join(", ")}.`;
}

export function OrbitScene({
  reference,
  interrupted,
  currentTimeS,
  targetRadiusM,
  earthRadiusM = DEFAULT_EARTH_RADIUS_M,
  bodyName = "Earth",
  bodyVisual = DEFAULT_BODY_VISUAL,
  solarDistanceAu = 1,
  bodyRotationPeriodS = 86_164.1,
  spacecraftDesign = "hall-tug",
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
      bodyName,
      bodyVisual,
      solarDistanceAu,
      bodyRotationPeriodS,
      spacecraftDesign,
    });
  }, [
    camera,
    currentTimeS,
    earthRadiusM,
    follow,
    bodyName,
    bodyVisual,
    solarDistanceAu,
    bodyRotationPeriodS,
    spacecraftDesign,
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
            -
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
          aria-label={`${summary} ${bodyName} is the selected central body. Cyan is the reference trajectory; dashed amber is the interrupted trajectory. The view is visually three-dimensional while the propagated dynamics are planar.`}
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
        <span className="orbit-scene__model-badge">3D view | planar dynamics</span>
      </div>

      <div className="orbit-scene__footer">
        <p id={instructionsId} className="orbit-scene__instructions">
          Drag to rotate | Scroll to zoom | Arrow keys rotate | +/- zoom | R reset | F follow
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
