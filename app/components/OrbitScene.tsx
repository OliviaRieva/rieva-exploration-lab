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
  if (points.length < 2) return;
  const dash = shape === "diamond" ? [3, 5] : [];
  drawSegmentPass(
    context,
    points,
    front,
    color,
    front ? 0.82 : 0.62,
    dash,
    front ? 0.24 : 0.09,
  );

  context.save();
  context.fillStyle = color;
  context.globalAlpha = front ? 0.34 : 0.12;
  const markerStride = Math.max(1, Math.ceil(points.length / 30));
  for (let index = 0; index < points.length; index += markerStride) {
    const point = points[index];
    if ((point.depth >= 0) !== front) continue;
    if (shape === "diamond") {
      context.beginPath();
      context.moveTo(point.x, point.y - 1.05);
      context.lineTo(point.x + 1.05, point.y);
      context.lineTo(point.x, point.y + 1.05);
      context.lineTo(point.x - 1.05, point.y);
      context.closePath();
      context.fill();
    } else {
      context.fillRect(point.x - 0.65, point.y - 0.65, 1.3, 1.3);
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
      4,
      dash,
      (0.018 + age * 0.052) * visibility,
    );
    drawSegmentPass(
      context,
      section,
      front,
      color,
      front ? 1.65 : 1.15,
      dash,
      (0.18 + age * 0.78) * visibility,
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

interface SurfacePoint {
  x: number;
  y: number;
  foreshortening: number;
}

function visibleSurfacePoint(
  centerX: number,
  centerY: number,
  radius: number,
  longitude: number,
  latitude: number,
  rotation: number,
): SurfacePoint | null {
  const relativeLongitude =
    ((((longitude + rotation + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  const foreshortening = Math.cos(relativeLongitude);
  if (foreshortening <= 0.035) return null;
  return {
    x: centerX + Math.sin(relativeLongitude) * Math.cos(latitude) * radius,
    y: centerY + Math.sin(latitude) * radius * 0.92,
    foreshortening,
  };
}

function drawSurfaceEllipse(
  context: CanvasRenderingContext2D,
  point: SurfacePoint,
  radius: number,
  color: string,
  rotation = 0,
) {
  context.save();
  context.translate(point.x, point.y);
  context.rotate(rotation);
  context.scale(Math.max(0.12, point.foreshortening), 1);
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(0, 0, radius, radius * 0.64, 0, 0, TAU);
  context.fill();
  context.restore();
}

function drawRockySurface(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  rotation: number,
  bodyName: string,
) {
  const isMars = bodyName === "Mars";
  const craterCount = isMars ? 13 : bodyName === "Mercury" ? 24 : 20;

  for (let index = 0; index < craterCount; index += 1) {
    const longitude = (((index * 0.61803398875 + 0.11) % 1) - 0.5) * TAU;
    const latitude = Math.asin((((index * 0.41421356237 + 0.29) % 1) - 0.5) * 1.7);
    const point = visibleSurfacePoint(
      centerX,
      centerY,
      radius,
      longitude,
      latitude,
      rotation,
    );
    if (!point) continue;
    const craterRadius = radius * (0.018 + ((index * 17) % 7) * 0.0045);
    drawSurfaceEllipse(
      context,
      { ...point, x: point.x + craterRadius * 0.18 },
      craterRadius * 1.08,
      isMars ? "rgba(74, 35, 34, 0.34)" : "rgba(28, 25, 38, 0.34)",
      index * 0.37,
    );
    drawSurfaceEllipse(
      context,
      { ...point, x: point.x - craterRadius * 0.12, y: point.y - craterRadius * 0.1 },
      craterRadius * 0.72,
      isMars ? "rgba(247, 169, 119, 0.18)" : "rgba(248, 241, 226, 0.2)",
      index * 0.37,
    );
  }

  if (isMars) {
    const darkRegions = [
      [-0.7, -0.14, 0.19],
      [0.32, 0.11, 0.14],
      [1.82, -0.23, 0.17],
    ] as const;
    for (const [longitude, latitude, size] of darkRegions) {
      const point = visibleSurfacePoint(
        centerX,
        centerY,
        radius,
        longitude,
        latitude,
        rotation,
      );
      if (point) {
        drawSurfaceEllipse(
          context,
          point,
          radius * size,
          "rgba(67, 35, 43, 0.33)",
          -0.22,
        );
      }
    }
    context.fillStyle = "rgba(244, 230, 215, 0.74)";
    context.beginPath();
    context.ellipse(
      centerX,
      centerY - radius * 0.8,
      radius * 0.34,
      radius * 0.095,
      0,
      0,
      TAU,
    );
    context.fill();
  }
}

function drawEarthSurface(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  rotation: number,
) {
  const landMasses = [
    [-2.34, -0.12, 0.28, "rgba(116, 145, 91, 0.88)"],
    [-1.92, 0.42, 0.22, "rgba(165, 157, 96, 0.84)"],
    [-0.22, 0.12, 0.3, "rgba(111, 143, 83, 0.9)"],
    [0.62, -0.34, 0.2, "rgba(165, 142, 87, 0.82)"],
    [1.45, 0.2, 0.32, "rgba(98, 132, 79, 0.88)"],
    [2.31, -0.38, 0.17, "rgba(177, 151, 91, 0.78)"],
  ] as const;

  for (const [longitude, latitude, size, color] of landMasses) {
    const point = visibleSurfacePoint(
      centerX,
      centerY,
      radius,
      longitude,
      latitude,
      rotation,
    );
    if (!point) continue;
    drawSurfaceEllipse(context, point, radius * size, color, longitude * 0.28);
    drawSurfaceEllipse(
      context,
      { ...point, x: point.x + radius * size * 0.33, y: point.y + radius * size * 0.22 },
      radius * size * 0.56,
      color,
      -longitude * 0.18,
    );
  }

  context.fillStyle = "rgba(235, 246, 249, 0.82)";
  context.beginPath();
  context.ellipse(centerX, centerY - radius * 0.89, radius * 0.32, radius * 0.08, 0, 0, TAU);
  context.fill();
  context.beginPath();
  context.ellipse(centerX, centerY + radius * 0.88, radius * 0.38, radius * 0.075, 0, 0, TAU);
  context.fill();

  context.save();
  context.strokeStyle = "rgba(248, 252, 255, 0.48)";
  context.lineCap = "round";
  for (let band = 0; band < 7; band += 1) {
    const y = centerY + Math.sin(band * 2.17 + rotation * 0.35) * radius * 0.65;
    const x = centerX + Math.cos(band * 1.31 + rotation) * radius * 0.16;
    context.globalAlpha = 0.26 + (band % 3) * 0.07;
    context.lineWidth = Math.max(0.7, radius * 0.014);
    context.beginPath();
    context.moveTo(x - radius * 0.42, y);
    context.bezierCurveTo(
      x - radius * 0.18,
      y - radius * 0.08,
      x + radius * 0.14,
      y + radius * 0.08,
      x + radius * 0.39,
      y - radius * 0.015,
    );
    context.stroke();
  }
  context.restore();
}

function drawAtmosphericBands(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  rotation: number,
  bodyName: string,
) {
  const palettes: Record<string, readonly string[]> = {
    Venus: ["rgba(255, 238, 188, 0.42)", "rgba(174, 103, 62, 0.3)", "rgba(255, 216, 149, 0.34)"],
    Jupiter: ["rgba(255, 225, 188, 0.52)", "rgba(125, 73, 63, 0.44)", "rgba(229, 178, 139, 0.48)", "rgba(249, 239, 211, 0.5)"],
    Saturn: ["rgba(255, 239, 190, 0.4)", "rgba(139, 108, 75, 0.25)", "rgba(231, 204, 148, 0.42)"],
    Uranus: ["rgba(222, 255, 255, 0.2)", "rgba(72, 151, 166, 0.14)", "rgba(190, 244, 247, 0.22)"],
    Neptune: ["rgba(151, 200, 255, 0.3)", "rgba(24, 49, 130, 0.24)", "rgba(224, 244, 255, 0.2)"],
  };
  const palette = palettes[bodyName] ?? palettes.Venus;
  const bandCount = bodyName === "Jupiter" ? 15 : bodyName === "Saturn" ? 13 : 10;
  context.save();
  context.lineCap = "round";
  for (let index = 0; index < bandCount; index += 1) {
    const normalized = -0.86 + (index / Math.max(1, bandCount - 1)) * 1.72;
    const halfWidth = Math.sqrt(Math.max(0, 1 - normalized * normalized)) * radius;
    const drift = Math.sin(rotation * (index % 2 === 0 ? 0.8 : -0.54) + index * 1.9) * radius * 0.025;
    const y = centerY + normalized * radius;
    context.strokeStyle = palette[index % palette.length];
    context.lineWidth = Math.max(1, radius * (bodyName === "Jupiter" ? 0.075 : 0.06));
    context.beginPath();
    context.moveTo(centerX - halfWidth, y + drift);
    context.bezierCurveTo(
      centerX - halfWidth * 0.42,
      y - radius * 0.018,
      centerX + halfWidth * 0.34,
      y + radius * 0.022,
      centerX + halfWidth,
      y - drift * 0.42,
    );
    context.stroke();
  }
  context.restore();

  if (bodyName === "Jupiter") {
    const storm = visibleSurfacePoint(centerX, centerY, radius, -0.62, 0.34, rotation);
    if (storm) {
      drawSurfaceEllipse(context, storm, radius * 0.13, "rgba(143, 57, 48, 0.78)", -0.08);
      drawSurfaceEllipse(context, storm, radius * 0.086, "rgba(236, 152, 120, 0.58)", -0.08);
    }
  } else if (bodyName === "Neptune") {
    const storm = visibleSurfacePoint(centerX, centerY, radius, 1.4, 0.2, rotation);
    if (storm) {
      drawSurfaceEllipse(context, storm, radius * 0.1, "rgba(14, 28, 83, 0.7)", 0.08);
    }
  }
}

function drawPlanetSurface(
  context: CanvasRenderingContext2D,
  bodyName: string,
  bodyVisual: typeof DEFAULT_BODY_VISUAL,
  centerX: number,
  centerY: number,
  radius: number,
  rotation: number,
) {
  if (!Number.isFinite(radius) || radius <= 0) return;
  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, TAU);
  context.clip();

  const base = context.createRadialGradient(
    centerX + radius * 0.34,
    centerY - radius * 0.32,
    radius * 0.04,
    centerX,
    centerY,
    radius * 1.08,
  );
  base.addColorStop(0, bodyVisual.light);
  base.addColorStop(0.45, bodyVisual.mid);
  base.addColorStop(1, bodyVisual.dark);
  context.fillStyle = base;
  context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

  if (bodyName === "Earth") {
    drawEarthSurface(context, centerX, centerY, radius, rotation);
  } else if (bodyName === "Mars" || bodyName === "Moon" || bodyName === "Mercury") {
    drawRockySurface(context, centerX, centerY, radius, rotation, bodyName);
  } else {
    drawAtmosphericBands(context, centerX, centerY, radius, rotation, bodyName);
  }

  const daylight = context.createLinearGradient(
    centerX - radius * 0.86,
    centerY + radius * 0.72,
    centerX + radius * 0.86,
    centerY - radius * 0.72,
  );
  daylight.addColorStop(0, "rgba(1, 3, 12, 0.9)");
  daylight.addColorStop(0.34, "rgba(3, 5, 18, 0.66)");
  daylight.addColorStop(0.52, "rgba(5, 8, 22, 0.28)");
  daylight.addColorStop(0.68, "rgba(10, 12, 28, 0.035)");
  daylight.addColorStop(1, "rgba(255, 244, 218, 0.16)");
  context.fillStyle = daylight;
  context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

  if (bodyName !== "Moon" && bodyName !== "Mercury" && bodyName !== "Mars") {
    const specular = context.createRadialGradient(
      centerX + radius * 0.43,
      centerY - radius * 0.38,
      0,
      centerX + radius * 0.43,
      centerY - radius * 0.38,
      radius * 0.72,
    );
    specular.addColorStop(0, "rgba(255, 252, 235, 0.2)");
    specular.addColorStop(0.22, "rgba(236, 249, 255, 0.095)");
    specular.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = specular;
    context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  }

  const limb = context.createRadialGradient(
    centerX,
    centerY,
    radius * 0.38,
    centerX,
    centerY,
    radius,
  );
  limb.addColorStop(0, "rgba(0, 0, 0, 0)");
  limb.addColorStop(0.67, "rgba(0, 0, 0, 0.025)");
  limb.addColorStop(0.9, "rgba(0, 0, 8, 0.18)");
  limb.addColorStop(1, "rgba(0, 0, 8, 0.58)");
  context.fillStyle = limb;
  context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  context.restore();
}

function drawAtmosphericLimb(
  context: CanvasRenderingContext2D,
  bodyName: string,
  atmosphereColor: string,
  centerX: number,
  centerY: number,
  radius: number,
) {
  const airless = bodyName === "Mercury" || bodyName === "Moon";
  const thin = bodyName === "Mars";
  context.save();
  if (!airless) {
    context.strokeStyle = atmosphereColor;
    context.shadowColor = atmosphereColor;
    context.shadowBlur = thin ? 6 : 13;
    context.globalAlpha = thin ? 0.46 : 0.72;
    context.lineWidth = thin ? 0.9 : Math.max(1.2, radius * 0.018);
    context.beginPath();
    context.arc(centerX, centerY, radius * 1.012, 0, TAU);
    context.stroke();
    context.globalAlpha *= 0.32;
    context.lineWidth = Math.max(0.8, radius * 0.012);
    context.beginPath();
    context.arc(centerX, centerY, radius * (thin ? 1.035 : 1.055), 0, TAU);
    context.stroke();
  }

  context.shadowBlur = 0;
  const sunlight = context.createLinearGradient(
    centerX - radius,
    centerY + radius,
    centerX + radius,
    centerY - radius,
  );
  sunlight.addColorStop(0, "rgba(255,255,255,0)");
  sunlight.addColorStop(0.63, "rgba(255,255,255,0)");
  sunlight.addColorStop(1, airless ? "rgba(255,235,211,0.48)" : "rgba(225,250,255,0.82)");
  context.strokeStyle = sunlight;
  context.globalAlpha = 0.78;
  context.lineWidth = airless ? 0.8 : 1.45;
  context.beginPath();
  context.arc(centerX, centerY, radius * 1.003, 0, TAU);
  context.stroke();
  context.restore();
}

function drawSaturnRings(
  context: CanvasRenderingContext2D,
  radiusM: number,
  projection: Projection,
  front: boolean,
) {
  const bands = [
    { radius: 1.39, width: 6.2, color: "rgba(171, 145, 104, 0.5)" },
    { radius: 1.54, width: 8.4, color: "rgba(226, 207, 162, 0.72)" },
    { radius: 1.72, width: 5.8, color: "rgba(250, 232, 190, 0.78)" },
    { radius: 1.88, width: 2.8, color: "rgba(117, 94, 84, 0.52)" },
    { radius: 2.02, width: 4.1, color: "rgba(220, 198, 159, 0.54)" },
  ] as const;
  for (const band of bands) {
    drawSegmentPass(
      context,
      ringPoints(radiusM * band.radius, projection, 240),
      front,
      band.color,
      band.width,
      [],
      front ? 0.96 : 0.58,
    );
  }
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
    const plumeLength = design === "cargo-spiraler" ? 32 : design === "ion-scout" ? 25 : 29;
    context.save();
    context.shadowColor = accent;
    context.shadowBlur = 8;
    context.fillStyle = accent;
    context.globalAlpha = 0.16;
    context.beginPath();
    context.moveTo(-8, -2.2);
    context.quadraticCurveTo(-18, -2.7, -plumeLength, 0);
    context.quadraticCurveTo(-18, 2.7, -8, 2.2);
    context.closePath();
    context.fill();

    context.strokeStyle = accent;
    context.lineCap = "round";
    context.globalAlpha = 0.66;
    context.lineWidth = 0.72;
    context.beginPath();
    context.moveTo(-8, 0);
    context.lineTo(-plumeLength * 0.86, 0);
    context.stroke();

    context.strokeStyle = "rgba(244, 250, 255, 0.9)";
    context.globalAlpha = 0.78;
    context.lineWidth = 0.45;
    context.beginPath();
    context.moveTo(-8, 0);
    context.lineTo(-plumeLength * 0.58, 0);
    context.stroke();
    context.restore();
  }

  // Four short acquisition arcs identify each propagated case without hiding
  // the actual vehicle silhouette behind a large marker bubble.
  context.save();
  context.strokeStyle = accent;
  context.globalAlpha = variant === "reference" ? 0.5 : 0.65;
  context.lineWidth = 0.85;
  context.setLineDash(variant === "interrupted" ? [2, 2.4] : []);
  for (let quadrant = 0; quadrant < 4; quadrant += 1) {
    const start = quadrant * (TAU / 4) + 0.14;
    context.beginPath();
    context.arc(0, 0, 14.5, start, start + 0.37);
    context.stroke();
  }
  context.restore();

  context.shadowColor = accent;
  context.shadowBlur = 6;
  const metal = context.createLinearGradient(0, -9, 0, 9);
  metal.addColorStop(0, "#ffffff");
  metal.addColorStop(0.45, "#dce3ec");
  metal.addColorStop(0.7, "#f8fbfd");
  metal.addColorStop(1, "#aab6c6");
  const panel = context.createLinearGradient(-8, 0, 8, 0);
  panel.addColorStop(0, "#24294f");
  panel.addColorStop(0.48, "#59649c");
  panel.addColorStop(1, "#272c55");

  const drawPanel = (x: number, y: number, width: number, height: number) => {
    context.save();
    context.fillStyle = panel;
    context.strokeStyle = accent;
    context.globalAlpha = 0.94;
    context.lineWidth = 0.55;
    context.beginPath();
    context.moveTo(x + 1.2, y);
    context.lineTo(x + width - 0.8, y);
    context.lineTo(x + width, y + height - 1);
    context.lineTo(x + 0.8, y + height);
    context.lineTo(x, y + 1);
    context.closePath();
    context.fill();
    context.stroke();
    context.strokeStyle = "rgba(223, 239, 250, 0.28)";
    context.beginPath();
    context.moveTo(x + width / 2, y + 0.5);
    context.lineTo(x + width / 2, y + height - 0.5);
    context.moveTo(x + 0.6, y + height / 2);
    context.lineTo(x + width - 0.6, y + height / 2);
    context.stroke();
    context.restore();
  };

  context.fillStyle = metal;
  context.strokeStyle = "rgba(3, 13, 23, 0.9)";
  context.lineWidth = 0.9;

  if (design === "cargo-spiraler") {
    drawPanel(-5.5, -15.5, 12, 8);
    drawPanel(-5.5, 7.5, 12, 8);
    context.beginPath();
    context.roundRect(-9, -5.1, 19, 10.2, 2.3);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(14, 0);
    context.lineTo(9, -3.8);
    context.lineTo(9, 3.8);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = "rgba(48, 57, 80, 0.88)";
    context.fillRect(-7.5, -2.8, 4.2, 5.6);
  } else if (design === "ion-scout") {
    drawPanel(-4.5, -10.5, 8, 5.2);
    drawPanel(-4.5, 5.3, 8, 5.2);
    context.beginPath();
    context.moveTo(13, 0);
    context.bezierCurveTo(6.3, -3, -1.5, -3.8, -8.5, -2.2);
    context.lineTo(-8.5, 2.2);
    context.bezierCurveTo(-1.5, 3.8, 6.3, 3, 13, 0);
    context.closePath();
    context.fill();
    context.stroke();
  } else {
    drawPanel(-4.5, -13.2, 10.5, 6.5);
    drawPanel(-4.5, 6.7, 10.5, 6.5);
    context.beginPath();
    context.moveTo(12.5, 0);
    context.bezierCurveTo(8.4, -3.5, 2.8, -4.8, -6.6, -3.3);
    context.lineTo(-8.1, -2.2);
    context.lineTo(-8.1, 2.2);
    context.lineTo(-6.6, 3.3);
    context.bezierCurveTo(2.8, 4.8, 8.4, 3.5, 12.5, 0);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = metal;
    context.beginPath();
    context.moveTo(-3.8, -3.5);
    context.lineTo(-8.2, -7.2);
    context.lineTo(-7.8, -2.3);
    context.closePath();
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(-3.8, 3.5);
    context.lineTo(-8.2, 7.2);
    context.lineTo(-7.8, 2.3);
    context.closePath();
    context.fill();
    context.stroke();
  }

  context.shadowBlur = 0;
  context.fillStyle = "#151b2b";
  context.strokeStyle = accent;
  context.lineWidth = 0.8;
  context.beginPath();
  context.ellipse(4.2, 0, 2.7, 1.9, 0, 0, TAU);
  context.fill();
  context.stroke();

  context.fillStyle = "#b7c3cf";
  context.fillRect(-9, -1.7, 1.5, 3.4);
  context.restore();

  context.save();
  context.fillStyle = accent;
  context.globalAlpha = 0.72;
  context.font = "600 7px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textAlign = "left";
  context.fillText(variant === "reference" ? "REF" : "INT", point.x + 13, point.y - 12);
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
  backdrop.addColorStop(0.48, "#07131f");
  backdrop.addColorStop(0.8, "#040b15");
  backdrop.addColorStop(1, "#02060d");
  context.fillStyle = backdrop;
  context.fillRect(0, 0, width, height);

  context.save();
  const stellarHaze = context.createLinearGradient(0, height, width, 0);
  stellarHaze.addColorStop(0, "rgba(83, 57, 153, 0)");
  stellarHaze.addColorStop(0.48, "rgba(105, 82, 170, 0.055)");
  stellarHaze.addColorStop(0.55, "rgba(86, 172, 205, 0.04)");
  stellarHaze.addColorStop(1, "rgba(83, 57, 153, 0)");
  context.fillStyle = stellarHaze;
  context.fillRect(0, 0, width, height);
  for (let index = 0; index < 96; index += 1) {
    const x = (((index * 577) % 997) / 997) * width;
    const y = (((index * 293 + 71) % 991) / 991) * height;
    const radius = index % 29 === 0 ? 1.05 : index % 7 === 0 ? 0.7 : 0.36;
    context.fillStyle =
      index % 17 === 0
        ? "rgba(255, 216, 181, 0.5)"
        : index % 7 === 0
          ? "rgba(156, 221, 255, 0.48)"
          : "rgba(232, 239, 255, 0.25)";
    if (radius > 1) {
      context.shadowColor = context.fillStyle;
      context.shadowBlur = 5;
    } else {
      context.shadowBlur = 0;
    }
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
  const sunDisc = context.createRadialGradient(
    sunX - sunRadius * 0.3,
    sunY - sunRadius * 0.35,
    0,
    sunX,
    sunY,
    sunRadius,
  );
  sunDisc.addColorStop(0, "#ffffff");
  sunDisc.addColorStop(0.56, "#fff4c8");
  sunDisc.addColorStop(1, "#ffc66f");
  context.fillStyle = sunDisc;
  context.beginPath();
  context.arc(sunX, sunY, sunRadius, 0, TAU);
  context.fill();
  context.save();
  context.strokeStyle = "rgba(255, 222, 161, 0.26)";
  context.lineWidth = 0.65;
  context.beginPath();
  context.moveTo(sunX - sunRadius * 1.75, sunY);
  context.lineTo(sunX - sunRadius * 1.2, sunY);
  context.moveTo(sunX + sunRadius * 1.2, sunY);
  context.lineTo(sunX + sunRadius * 1.75, sunY);
  context.moveTo(sunX, sunY - sunRadius * 1.75);
  context.lineTo(sunX, sunY - sunRadius * 1.2);
  context.moveTo(sunX, sunY + sunRadius * 1.2);
  context.lineTo(sunX, sunY + sunRadius * 1.75);
  context.stroke();
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

  drawSegmentPass(context, targetRing, false, PALE, 0.8, [5, 8], 0.2);
  drawSegmentPass(context, initialRing, false, CYAN, 0.65, [2, 7], 0.14);
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
  drawSegmentPass(context, outageRecentPoints, false, AMBER, 3.2, [], 0.08);

  const earthScreenRadius = options.earthRadiusM * projection.scale;
  const bodyRotation =
    (options.currentTimeS / Math.max(1, Math.abs(options.bodyRotationPeriodS))) *
    TAU *
    Math.sign(options.bodyRotationPeriodS || 1);
  const atmosphere = context.createRadialGradient(
    projection.centerX,
    projection.centerY,
    earthScreenRadius * 0.86,
    projection.centerX,
    projection.centerY,
    earthScreenRadius * 1.18,
  );
  atmosphere.addColorStop(0, "rgba(255, 255, 255, 0)");
  atmosphere.addColorStop(0.57, options.bodyVisual.atmosphere);
  atmosphere.addColorStop(0.76, options.bodyVisual.atmosphere);
  atmosphere.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = atmosphere;
  context.beginPath();
  context.arc(
    projection.centerX,
    projection.centerY,
    earthScreenRadius * 1.17,
    0,
    TAU,
  );
  context.fill();

  if (options.bodyName === "Saturn") {
    drawSaturnRings(context, options.earthRadiusM, projection, false);
  }
  drawPlanetSurface(
    context,
    options.bodyName,
    options.bodyVisual,
    projection.centerX,
    projection.centerY,
    earthScreenRadius,
    bodyRotation,
  );
  drawAtmosphericLimb(
    context,
    options.bodyName,
    options.bodyVisual.atmosphere,
    projection.centerX,
    projection.centerY,
    earthScreenRadius,
  );
  if (options.bodyName === "Saturn") {
    drawSaturnRings(context, options.earthRadiusM, projection, true);
  }

  drawSegmentPass(context, targetRing, true, PALE, 1.05, [5, 8], 0.62);
  drawSegmentPass(context, initialRing, true, CYAN, 0.7, [2, 7], 0.28);
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
  drawSegmentPass(context, outageRecentPoints, true, AMBER, 3.2, [], 0.13);

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
      data-playing={isPlaying ? "true" : "false"}
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
