import {
  bootStyles,
  palettes,
  pantsStyles,
  suitConcepts,
  torsoStyles,
  type MissionId,
} from "./catalog.ts";

export type TerrainId = "level" | "rocky" | "slope" | "dusty";
export type TaskId = "survey" | "geology" | "construction" | "mobility";
export type LightingId = "sun" | "shade" | "mixed";
export type BodyPresetId = "compact" | "standard" | "tall";
export type TorsoStyleId = "streamline" | "field-rig" | "adaptive";
export type BootStyleId = "traverse" | "rock" | "stability";

export interface StudioAccessories {
  catEars: boolean;
  staff: boolean;
  assist: boolean;
  dust: boolean;
  haptics: boolean;
  shoulderCamera: boolean;
  tetherReel: boolean;
  sampleKit: boolean;
}

export const vectorSupportedAccessories: ReadonlyArray<keyof StudioAccessories> = [
  "staff",
  "assist",
  "haptics",
  "shoulderCamera",
];

const vectorSupportedAccessorySet = new Set<keyof StudioAccessories>(
  vectorSupportedAccessories,
);

export interface StudioConfiguration {
  version: 1;
  conceptId: "selene" | "areo" | "vector";
  paletteId: "pearl" | "champagne" | "signal" | "obsidian";
  pantsStyle: "contour" | "field" | "mobility";
  torsoStyle: TorsoStyleId;
  bootStyle: BootStyleId;
  bodyPreset: BodyPresetId;
  mission: MissionId;
  terrain: TerrainId;
  task: TaskId;
  lighting: LightingId;
  mode: "mission" | "assembly";
  helmetAttached: boolean;
  accessories: StudioAccessories;
  accessoryBatteryWh: number;
}

export interface CompatibilityResult {
  status: "required-items-present" | "conceptual-combination" | "unresolved-conflicts";
  label: string;
  missingRequirements: string[];
  conflicts: string[];
  suggestions: string[];
  astronautMassKg: number;
  equipmentMassKg: number;
  combinedMassKg: number;
  gravityMps2: number;
  weightN: number;
  accessoryPowerW: number;
  accessoryRuntimeH: number | null;
}

export const DEFAULT_STUDIO_CONFIGURATION: StudioConfiguration = {
  version: 1,
  conceptId: "selene",
  paletteId: "pearl",
  pantsStyle: "contour",
  torsoStyle: "streamline",
  bootStyle: "traverse",
  bodyPreset: "standard",
  mission: "moon",
  terrain: "rocky",
  task: "geology",
  lighting: "mixed",
  mode: "mission",
  helmetAttached: true,
  accessories: {
    catEars: false,
    staff: true,
    assist: false,
    dust: true,
    haptics: false,
    shoulderCamera: false,
    tetherReel: true,
    sampleKit: true,
  },
  accessoryBatteryWh: 180,
};

const conceptIds = new Set<StudioConfiguration["conceptId"]>([
  ...suitConcepts.map((concept) => concept.id),
]);
const paletteIds = new Set<StudioConfiguration["paletteId"]>([
  ...palettes.map((palette) => palette.id),
]);
const pantsIds = new Set<StudioConfiguration["pantsStyle"]>([
  ...pantsStyles.map((style) => style.id),
]);
const torsoIds = new Set<TorsoStyleId>(
  torsoStyles.map((style) => style.id),
);
const bootIds = new Set<BootStyleId>(bootStyles.map((style) => style.id));
const bodyIds = new Set<BodyPresetId>(["compact", "standard", "tall"]);
const missionIds = new Set<MissionId>(["moon", "mars", "earth", "high-gravity"]);
const terrainIds = new Set<TerrainId>(["level", "rocky", "slope", "dusty"]);
const taskIds = new Set<TaskId>(["survey", "geology", "construction", "mobility"]);
const lightIds = new Set<LightingId>(["sun", "shade", "mixed"]);

function cloneDefaultStudioConfiguration(): StudioConfiguration {
  return {
    ...DEFAULT_STUDIO_CONFIGURATION,
    accessories: { ...DEFAULT_STUDIO_CONFIGURATION.accessories },
  };
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isMember<T extends string>(
  values: ReadonlySet<T>,
  value: unknown,
): value is T {
  return typeof value === "string" && values.has(value as T);
}

export const gravityByMission: Record<MissionId, number> = {
  moon: 1.62,
  mars: 3.71,
  earth: 9.81,
  "high-gravity": 14.72,
};

export const missionLabels: Record<MissionId, string> = {
  moon: "Moon",
  mars: "Mars",
  earth: "Earth training",
  "high-gravity": "Higher-gravity study (hypothetical, 1.5 g)",
};

const bodyMassKg: Record<BodyPresetId, number> = {
  compact: 62,
  standard: 75,
  tall: 90,
};

const accessoryAssumptions = {
  catEars: { massKg: 0.7, powerW: 6 },
  staff: { massKg: 1.6, powerW: 4 },
  assist: { massKg: 6.5, powerW: 80 },
  dust: { massKg: 0.8, powerW: 12 },
  haptics: { massKg: 0.5, powerW: 5 },
  shoulderCamera: { massKg: 0.9, powerW: 14 },
  tetherReel: { massKg: 1.2, powerW: 0 },
  sampleKit: { massKg: 2.4, powerW: 0 },
} as const satisfies Readonly<
  Record<keyof StudioAccessories, { massKg: number; powerW: number }>
>;

export { accessoryAssumptions, bodyMassKg };

const suitConceptById = new Map(
  suitConcepts.map((concept) => [concept.id, concept]),
);

function conceptById(id: StudioConfiguration["conceptId"]) {
  return suitConceptById.get(id) ?? suitConcepts[0];
}

export function normalizeStudioConfiguration(
  value: unknown,
): StudioConfiguration {
  if (!value || typeof value !== "object") return cloneDefaultStudioConfiguration();
  const candidate = value as Partial<StudioConfiguration>;
  // Missing versions are accepted as the legacy v1 shape. A newer explicit
  // version must not be guessed at by an older client.
  if (candidate.version !== undefined && candidate.version !== 1) {
    return cloneDefaultStudioConfiguration();
  }
  const base = DEFAULT_STUDIO_CONFIGURATION;
  const accessories =
    candidate.accessories && typeof candidate.accessories === "object"
      ? (candidate.accessories as Partial<StudioAccessories>)
      : base.accessories;
  const conceptId = isMember(conceptIds, candidate.conceptId)
    ? candidate.conceptId
    : base.conceptId;
  const normalizedAccessories: StudioAccessories = {
    catEars: booleanOrDefault(accessories.catEars, base.accessories.catEars),
    staff: booleanOrDefault(accessories.staff, base.accessories.staff),
    assist: booleanOrDefault(accessories.assist, base.accessories.assist),
    dust: booleanOrDefault(accessories.dust, base.accessories.dust),
    haptics: booleanOrDefault(accessories.haptics, base.accessories.haptics),
    shoulderCamera: booleanOrDefault(
      accessories.shoulderCamera,
      base.accessories.shoulderCamera,
    ),
    tetherReel: booleanOrDefault(
      accessories.tetherReel,
      base.accessories.tetherReel,
    ),
    sampleKit: booleanOrDefault(
      accessories.sampleKit,
      base.accessories.sampleKit,
    ),
  };
  if (conceptId === "vector") {
    (Object.keys(normalizedAccessories) as Array<keyof StudioAccessories>).forEach(
      (key) => {
        if (!vectorSupportedAccessorySet.has(key)) normalizedAccessories[key] = false;
      },
    );
  }

  return {
    version: 1,
    conceptId,
    paletteId: isMember(paletteIds, candidate.paletteId) ? candidate.paletteId : base.paletteId,
    pantsStyle: isMember(pantsIds, candidate.pantsStyle) ? candidate.pantsStyle : base.pantsStyle,
    torsoStyle: isMember(torsoIds, candidate.torsoStyle) ? candidate.torsoStyle : base.torsoStyle,
    bootStyle: isMember(bootIds, candidate.bootStyle) ? candidate.bootStyle : base.bootStyle,
    bodyPreset: isMember(bodyIds, candidate.bodyPreset) ? candidate.bodyPreset : base.bodyPreset,
    mission: isMember(missionIds, candidate.mission) ? candidate.mission : base.mission,
    terrain: isMember(terrainIds, candidate.terrain) ? candidate.terrain : base.terrain,
    task: isMember(taskIds, candidate.task) ? candidate.task : base.task,
    lighting: isMember(lightIds, candidate.lighting) ? candidate.lighting : base.lighting,
    mode:
      conceptId === "vector"
        ? "assembly"
        : candidate.mode === "assembly"
          ? "assembly"
          : "mission",
    helmetAttached:
      conceptId === "vector"
        ? false
        : candidate.mode === "assembly"
          ? candidate.helmetAttached !== false
          : true,
    accessories: normalizedAccessories,
    accessoryBatteryWh:
      typeof candidate.accessoryBatteryWh === "number" &&
      Number.isFinite(candidate.accessoryBatteryWh) &&
      candidate.accessoryBatteryWh >= 0 &&
      candidate.accessoryBatteryWh <= 2_000
        ? candidate.accessoryBatteryWh
        : base.accessoryBatteryWh,
  };
}

export function encodeStudioConfiguration(config: StudioConfiguration): string {
  return JSON.stringify(normalizeStudioConfiguration(config), null, 2);
}

export function decodeStudioConfiguration(serialized: string): StudioConfiguration {
  try {
    return normalizeStudioConfiguration(JSON.parse(serialized));
  } catch {
    return cloneDefaultStudioConfiguration();
  }
}

export function evaluateStudioConfiguration(
  input: StudioConfiguration,
): CompatibilityResult {
  const config = normalizeStudioConfiguration(input);
  const concept = conceptById(config.conceptId);
  const missingRequirements: string[] = [];
  const conflicts: string[] = [];
  const suggestions: string[] = [];
  const evaMission = config.mission === "moon" || config.mission === "mars";

  if (evaMission && !config.helmetAttached) {
    missingRequirements.push("Attached sealed helmet and verified neck interface");
  }
  if (evaMission && concept.id === "vector") {
    missingRequirements.push("Complete pressure-retention, restraint, thermal, and portable life-support system");
    conflicts.push("BASTIAN is an Earth-based mobility research garment, not surface EVA equipment.");
  }
  if (config.paletteId === "obsidian" && evaMission) {
    conflicts.push(
      `Obsidian EVA exterior requires unresolved mission-specific radiative and thermal assessment${config.lighting === "shade" ? ", including shaded operation and transitions" : "; direct sunlight increases the concern"}.`,
    );
  }
  if (config.accessories.catEars && (config.terrain === "rocky" || config.task === "construction")) {
    conflicts.push("Helmet pods need snag, hatch-clearance, impact, and antenna-pattern testing for this task.");
  }
  if (config.accessories.assist) {
    conflicts.push("Assistive module alignment, fail-safe behavior, heat, and powered-joint loads remain unvalidated.");
  }
  if (config.accessories.dust) {
    conflicts.push("Electrodynamic dust-shield behavior is demonstrated research; this flexible suit integration is not qualified.");
  }
  if (config.mission === "high-gravity") {
    conflicts.push("The higher-gravity environment is a hypothetical study case, not a flight recommendation.");
  }

  if ((config.terrain === "rocky" || config.terrain === "slope") && !config.accessories.staff) {
    suggestions.push("Consider the walking staff as a probing and third-contact concept; it cannot guarantee traction.");
  }
  if (config.terrain === "dusty" && !config.accessories.dust) {
    suggestions.push("Prioritize passive dust gaiters; the electrode module may be studied as an additional research layer.");
  }
  if ((config.task === "geology" || config.task === "construction") && config.pantsStyle !== "field") {
    suggestions.push("Field cargo outer panels place sample pockets and tether points outside pressure-critical seams.");
  }
  if (config.task === "geology" && !config.accessories.sampleKit) {
    suggestions.push("Add a sealed sample/tool kit if the geology procedure requires controlled specimen handling.");
  }
  if ((config.task === "survey" || config.task === "construction") && !config.accessories.shoulderCamera) {
    suggestions.push("A shoulder camera could document the worksite hands-free, subject to glare, bandwidth, privacy, and failure-mode review.");
  }
  if (evaMission && !config.accessories.tetherReel) {
    suggestions.push("Review task-specific tether and tool-retention needs; the optional reel shown here supplements, rather than replaces, baseline retention points.");
  }
  if ((config.terrain === "rocky" || config.terrain === "slope") && config.bootStyle === "traverse") {
    suggestions.push("Compare the rock-contact or broad-stability outer boot packages; neither establishes traction without representative terrain tests.");
  }
  if (config.task === "mobility" && !config.accessories.haptics) {
    suggestions.push("Haptic cues could be evaluated as a research aid, with false-cue and power failure cases included.");
  }
  if (config.mission === "mars") {
    suggestions.push("Mars still requires pressure protection and life support; this tool does not assume a habitable atmosphere.");
  }
  if (config.mission === "moon") {
    suggestions.push("Low lunar gravity reduces weight, not inertia; stopping and redirecting the same mass still requires force.");
  }

  let accessoryMassKg = 0;
  let accessoryPowerW = 0;
  (Object.keys(config.accessories) as Array<keyof StudioAccessories>).forEach((key) => {
    if (config.accessories[key]) {
      accessoryMassKg += accessoryAssumptions[key].massKg;
      accessoryPowerW += accessoryAssumptions[key].powerW;
    }
  });
  const astronautMassKg = bodyMassKg[config.bodyPreset];
  const equipmentMassKg = concept.equipmentMassKg + accessoryMassKg;
  const combinedMassKg = astronautMassKg + equipmentMassKg;
  const gravityMps2 = gravityByMission[config.mission];
  const accessoryRuntimeH =
    accessoryPowerW > 0 ? (config.accessoryBatteryWh * 0.85) / accessoryPowerW : null;

  const status =
    missingRequirements.length > 0
      ? "unresolved-conflicts"
      : conflicts.length > 0
        ? "conceptual-combination"
        : "required-items-present";
  const label =
    status === "required-items-present"
      ? "Required items present"
      : status === "conceptual-combination"
        ? "Conceptual combination"
        : "Unresolved requirements";

  return {
    status,
    label,
    missingRequirements,
    conflicts,
    suggestions,
    astronautMassKg,
    equipmentMassKg,
    combinedMassKg,
    gravityMps2,
    weightN: combinedMassKg * gravityMps2,
    accessoryPowerW,
    accessoryRuntimeH,
  };
}
