import { suitConcepts, type MissionId } from "./catalog.ts";

export type TerrainId = "level" | "rocky" | "slope" | "dusty";
export type TaskId = "survey" | "geology" | "construction" | "mobility";
export type LightingId = "sun" | "shade" | "mixed";
export type BodyPresetId = "compact" | "standard" | "tall";

export interface StudioAccessories {
  catEars: boolean;
  staff: boolean;
  assist: boolean;
  dust: boolean;
  haptics: boolean;
}

export interface StudioConfiguration {
  version: 1;
  conceptId: "selene" | "areo" | "vector";
  paletteId: "pearl" | "champagne" | "obsidian";
  pantsStyle: "contour" | "field" | "mobility";
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
  },
  accessoryBatteryWh: 180,
};

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
} as const;

export { accessoryAssumptions, bodyMassKg };

function conceptById(id: StudioConfiguration["conceptId"]) {
  return suitConcepts.find((concept) => concept.id === id) ?? suitConcepts[0];
}

export function normalizeStudioConfiguration(
  value: unknown,
): StudioConfiguration {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_STUDIO_CONFIGURATION);
  const candidate = value as Partial<StudioConfiguration>;
  const conceptIds = new Set(["selene", "areo", "vector"]);
  const paletteIds = new Set(["pearl", "champagne", "obsidian"]);
  const pantsIds = new Set(["contour", "field", "mobility"]);
  const bodyIds = new Set(["compact", "standard", "tall"]);
  const missionIds = new Set(["moon", "mars", "earth", "high-gravity"]);
  const terrainIds = new Set(["level", "rocky", "slope", "dusty"]);
  const taskIds = new Set(["survey", "geology", "construction", "mobility"]);
  const lightIds = new Set(["sun", "shade", "mixed"]);
  const base = DEFAULT_STUDIO_CONFIGURATION;
  const accessories = candidate.accessories ?? base.accessories;

  return {
    version: 1,
    conceptId: conceptIds.has(candidate.conceptId ?? "") ? candidate.conceptId! : base.conceptId,
    paletteId: paletteIds.has(candidate.paletteId ?? "") ? candidate.paletteId! : base.paletteId,
    pantsStyle: pantsIds.has(candidate.pantsStyle ?? "") ? candidate.pantsStyle! : base.pantsStyle,
    bodyPreset: bodyIds.has(candidate.bodyPreset ?? "") ? candidate.bodyPreset! : base.bodyPreset,
    mission: missionIds.has(candidate.mission ?? "") ? candidate.mission! : base.mission,
    terrain: terrainIds.has(candidate.terrain ?? "") ? candidate.terrain! : base.terrain,
    task: taskIds.has(candidate.task ?? "") ? candidate.task! : base.task,
    lighting: lightIds.has(candidate.lighting ?? "") ? candidate.lighting! : base.lighting,
    mode: candidate.mode === "assembly" ? "assembly" : "mission",
    helmetAttached: candidate.mode === "assembly" ? candidate.helmetAttached !== false : true,
    accessories: {
      catEars: Boolean(accessories.catEars),
      staff: Boolean(accessories.staff),
      assist: Boolean(accessories.assist),
      dust: Boolean(accessories.dust),
      haptics: Boolean(accessories.haptics),
    },
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
    return structuredClone(DEFAULT_STUDIO_CONFIGURATION);
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
    conflicts.push("VECTOR is an Earth-based mobility research garment, not surface EVA equipment.");
  }
  if (config.paletteId === "obsidian" && evaMission && config.lighting !== "shade") {
    conflicts.push("Obsidian exterior in sunlight requires unresolved mission-specific thermal assessment.");
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
