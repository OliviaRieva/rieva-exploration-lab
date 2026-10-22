export type FlightMode = "cruise" | "adaptive" | "low-boom";
export type FlowMode = "streamlines" | "pressure" | "shock-cues";
export type EncounterScenario =
  | "unknown-signal"
  | "radiation-event"
  | "bioaerosol"
  | "sensor-dazzle"
  | "navigation-interference";

export type ContactModuleId =
  | "spectral-sensor"
  | "sensor-shutters"
  | "em-hardening"
  | "radiation-liner"
  | "bio-isolation"
  | "contact-array"
  | "redundant-controls"
  | "thermal-loop"
  | "observer-pod"
  | "anomaly-detector";

export interface ContactFlightConfiguration {
  version: 1;
  altitudeM: number;
  speedMps: number;
  angleOfAttackDeg: number;
  flightMode: FlightMode;
  flowMode: FlowMode;
  scenario: EncounterScenario;
  modules: Record<ContactModuleId, boolean>;
}

export interface ModuleAssumption {
  id: ContactModuleId;
  name: string;
  massKg: number;
  electricalPowerKw: number;
  deltaCd0: number;
  visible: boolean;
  maturity: "operational heritage" | "demonstrated research" | "original concept";
}

export const CONTACT_MODULES: readonly ModuleAssumption[] = [
  {
    id: "spectral-sensor",
    name: "Multispectral observation fairing",
    massKg: 68,
    electricalPowerKw: 5.5,
    deltaCd0: 0.001,
    visible: true,
    maturity: "demonstrated research",
  },
  {
    id: "sensor-shutters",
    name: "Fast sensor shutters",
    massKg: 22,
    electricalPowerKw: 0.7,
    deltaCd0: 0.0005,
    visible: true,
    maturity: "operational heritage",
  },
  {
    id: "em-hardening",
    name: "Electromagnetic hardening package",
    massKg: 76,
    electricalPowerKw: 3.2,
    deltaCd0: 0,
    visible: false,
    maturity: "operational heritage",
  },
  {
    id: "radiation-liner",
    name: "Localized radiation liner",
    massKg: 132,
    electricalPowerKw: 0.4,
    deltaCd0: 0,
    visible: false,
    maturity: "operational heritage",
  },
  {
    id: "bio-isolation",
    name: "Sealed sampling and filtration loop",
    massKg: 84,
    electricalPowerKw: 9.0,
    deltaCd0: 0.0015,
    visible: true,
    maturity: "original concept",
  },
  {
    id: "contact-array",
    name: "Wideband contact array",
    massKg: 51,
    electricalPowerKw: 6.5,
    deltaCd0: 0.0012,
    visible: true,
    maturity: "original concept",
  },
  {
    id: "redundant-controls",
    name: "Dissimilar redundant flight controls",
    massKg: 19,
    electricalPowerKw: 3.4,
    deltaCd0: 0,
    visible: false,
    maturity: "operational heritage",
  },
  {
    id: "thermal-loop",
    name: "Auxiliary thermal rejection loop",
    massKg: 116,
    electricalPowerKw: 17.5,
    deltaCd0: 0.0008,
    visible: true,
    maturity: "demonstrated research",
  },
  {
    id: "observer-pod",
    name: "Remote observation pod",
    massKg: 94,
    electricalPowerKw: 4.0,
    deltaCd0: 0.003,
    visible: true,
    maturity: "original concept",
  },
  {
    id: "anomaly-detector",
    name: "Unknown-physics field monitor",
    massKg: 37,
    electricalPowerKw: 12.0,
    deltaCd0: 0.0010,
    visible: true,
    maturity: "original concept",
  },
] as const;

export const DEFAULT_CONTACT_FLIGHT_CONFIGURATION: ContactFlightConfiguration = {
  version: 1,
  altitudeM: 9_000,
  speedMps: 230,
  angleOfAttackDeg: 1.8,
  flightMode: "cruise",
  flowMode: "streamlines",
  scenario: "unknown-signal",
  modules: {
    "spectral-sensor": true,
    "sensor-shutters": true,
    "em-hardening": false,
    "radiation-liner": false,
    "bio-isolation": false,
    "contact-array": true,
    "redundant-controls": true,
    "thermal-loop": false,
    "observer-pod": false,
    "anomaly-detector": false,
  },
};

const flightModes = new Set<FlightMode>(["cruise", "adaptive", "low-boom"]);
const flowModes = new Set<FlowMode>(["streamlines", "pressure", "shock-cues"]);
const scenarios = new Set<EncounterScenario>([
  "unknown-signal",
  "radiation-event",
  "bioaerosol",
  "sensor-dazzle",
  "navigation-interference",
]);

function cloneDefaultContactFlightConfiguration(): ContactFlightConfiguration {
  return {
    ...DEFAULT_CONTACT_FLIGHT_CONFIGURATION,
    modules: { ...DEFAULT_CONTACT_FLIGHT_CONFIGURATION.modules },
  };
}

export const SCENARIO_SUGGESTIONS: Readonly<
  Record<EncounterScenario, readonly ContactModuleId[]>
> = {
  "unknown-signal": [
    "spectral-sensor",
    "contact-array",
    "redundant-controls",
    "observer-pod",
  ],
  "radiation-event": [
    "radiation-liner",
    "em-hardening",
    "redundant-controls",
    "thermal-loop",
  ],
  bioaerosol: [
    "bio-isolation",
    "sensor-shutters",
    "redundant-controls",
    "observer-pod",
  ],
  "sensor-dazzle": [
    "sensor-shutters",
    "spectral-sensor",
    "redundant-controls",
    "em-hardening",
  ],
  "navigation-interference": [
    "redundant-controls",
    "em-hardening",
    "contact-array",
    "spectral-sensor",
  ],
};

export interface AtmosphereState {
  temperatureK: number;
  pressurePa: number;
  densityKgM3: number;
  speedOfSoundMps: number;
  dynamicViscosityPaS: number;
}

export interface ContactFlightResult extends AtmosphereState {
  mach: number;
  dynamicPressurePa: number;
  reynoldsNumber: number;
  liftCoefficient: number;
  dragCoefficient: number;
  liftN: number;
  dragN: number;
  liftToDrag: number;
  weightN: number;
  loadFactor: number;
  totalMassKg: number;
  moduleMassKg: number;
  modulePowerKw: number;
  moduleDragIncrement: number;
  estimatedThrustRequiredN: number;
  shockMachAngleDeg: number | null;
  state: "balanced-study-point" | "attention-required" | "outside-simple-model";
  messages: string[];
}

const BASE_MASS_KG = 13_850;
const WING_AREA_M2 = 46;
const MEAN_CHORD_M = 3.25;
const ASPECT_RATIO = 4.25;
const OSWALD_EFFICIENCY = 0.78;
const SYSTEM_POWER_BUDGET_KW = 90;
const G0 = 9.80665;

export const CONTACT_FLIGHT_ASSUMPTIONS = {
  baseMassKg: BASE_MASS_KG,
  wingAreaM2: WING_AREA_M2,
  meanChordM: MEAN_CHORD_M,
  aspectRatio: ASPECT_RATIO,
  oswaldEfficiency: OSWALD_EFFICIENCY,
  systemsPowerBudgetKw: SYSTEM_POWER_BUDGET_KW,
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finiteInRange(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, min, max)
    : fallback;
}

/** 1976-standard-atmosphere equations through 20 km, sufficient for this lab. */
export function standardAtmosphere(altitudeM: number): AtmosphereState {
  const h = finiteInRange(altitudeM, 0, 0, 20_000);
  const gasConstant = 287.05287;
  const gamma = 1.4;
  let temperatureK: number;
  let pressurePa: number;

  if (h <= 11_000) {
    temperatureK = 288.15 - 0.0065 * h;
    pressurePa = 101_325 * Math.pow(temperatureK / 288.15, 5.2558797);
  } else {
    temperatureK = 216.65;
    pressurePa = 22_632.06 * Math.exp((-G0 * (h - 11_000)) / (gasConstant * temperatureK));
  }

  const densityKgM3 = pressurePa / (gasConstant * temperatureK);
  const speedOfSoundMps = Math.sqrt(gamma * gasConstant * temperatureK);
  const sutherlandC = 110.4;
  const dynamicViscosityPaS =
    1.716e-5 * Math.pow(temperatureK / 273.15, 1.5) *
    ((273.15 + sutherlandC) / (temperatureK + sutherlandC));

  return {
    temperatureK,
    pressurePa,
    densityKgM3,
    speedOfSoundMps,
    dynamicViscosityPaS,
  };
}

export function normalizeContactFlightConfiguration(
  value: unknown,
): ContactFlightConfiguration {
  const base = DEFAULT_CONTACT_FLIGHT_CONFIGURATION;
  if (!value || typeof value !== "object") {
    return cloneDefaultContactFlightConfiguration();
  }
  const candidate = value as Partial<ContactFlightConfiguration>;
  if (candidate.version !== undefined && candidate.version !== 1) {
    return cloneDefaultContactFlightConfiguration();
  }
  const inputModules =
    candidate.modules && typeof candidate.modules === "object"
      ? candidate.modules
      : base.modules;
  const modules = Object.fromEntries(
    CONTACT_MODULES.map((module) => [
      module.id,
      typeof inputModules[module.id] === "boolean"
        ? inputModules[module.id]
        : base.modules[module.id],
    ]),
  ) as Record<ContactModuleId, boolean>;

  return {
    version: 1,
    altitudeM: finiteInRange(candidate.altitudeM, base.altitudeM, 0, 20_000),
    speedMps: finiteInRange(candidate.speedMps, base.speedMps, 45, 620),
    angleOfAttackDeg: finiteInRange(
      candidate.angleOfAttackDeg,
      base.angleOfAttackDeg,
      -6,
      20,
    ),
    flightMode: flightModes.has(candidate.flightMode as FlightMode)
      ? (candidate.flightMode as FlightMode)
      : base.flightMode,
    flowMode: flowModes.has(candidate.flowMode as FlowMode)
      ? (candidate.flowMode as FlowMode)
      : base.flowMode,
    scenario: scenarios.has(candidate.scenario as EncounterScenario)
      ? (candidate.scenario as EncounterScenario)
      : base.scenario,
    modules,
  };
}

export function encodeContactFlightConfiguration(config: ContactFlightConfiguration) {
  return JSON.stringify(normalizeContactFlightConfiguration(config), null, 2);
}

export function decodeContactFlightConfiguration(
  serialized: string,
): ContactFlightConfiguration {
  try {
    return normalizeContactFlightConfiguration(JSON.parse(serialized));
  } catch {
    return cloneDefaultContactFlightConfiguration();
  }
}

/**
 * Educational point model. It is deliberately not CFD, a stability-and-control
 * analysis, an engine deck, or a flight-envelope clearance.
 */
export function evaluateContactFlight(
  input: ContactFlightConfiguration,
): ContactFlightResult {
  const config = normalizeContactFlightConfiguration(input);
  const atmosphere = standardAtmosphere(config.altitudeM);
  const mach = config.speedMps / atmosphere.speedOfSoundMps;
  const dynamicPressurePa = 0.5 * atmosphere.densityKgM3 * config.speedMps ** 2;
  const reynoldsNumber =
    (atmosphere.densityKgM3 * config.speedMps * MEAN_CHORD_M) /
    atmosphere.dynamicViscosityPaS;

  let moduleMassKg = 0;
  let modulePowerKw = 0;
  let moduleDragIncrement = 0;
  for (const equipmentModule of CONTACT_MODULES) {
    if (!config.modules[equipmentModule.id]) continue;
    moduleMassKg += equipmentModule.massKg;
    modulePowerKw += equipmentModule.electricalPowerKw;
    moduleDragIncrement += equipmentModule.deltaCd0;
  }
  const totalMassKg = BASE_MASS_KG + moduleMassKg;

  const alphaRad = (config.angleOfAttackDeg * Math.PI) / 180;
  const modeLiftOffset = config.flightMode === "adaptive" ? 0.12 : 0;
  const modeDragOffset =
    config.flightMode === "adaptive" ? 0.0015 : config.flightMode === "low-boom" ? 0.0025 : 0;
  let liftCoefficient = 0.11 + 4.55 * alphaRad + modeLiftOffset;
  if (config.angleOfAttackDeg > 12) {
    liftCoefficient *= Math.max(0.48, 1 - 0.045 * (config.angleOfAttackDeg - 12) ** 1.35);
  }
  liftCoefficient = clamp(liftCoefficient, -0.55, 1.32);

  const inducedFactor = 1 / (Math.PI * OSWALD_EFFICIENCY * ASPECT_RATIO);
  const transonicRise = 0.021 / (1 + Math.exp(-18 * (mach - 0.88)));
  const supersonicRise = mach > 1 ? 0.012 * (mach - 1) : 0;
  const baseCd0 = 0.0205 + modeDragOffset;
  const dragCoefficient =
    baseCd0 + moduleDragIncrement + inducedFactor * liftCoefficient ** 2 +
    transonicRise + supersonicRise;

  const liftN = dynamicPressurePa * WING_AREA_M2 * liftCoefficient;
  const dragN = dynamicPressurePa * WING_AREA_M2 * dragCoefficient;
  const weightN = totalMassKg * G0;
  const loadFactor = liftN / weightN;
  const liftToDrag = dragCoefficient > 0 ? liftCoefficient / dragCoefficient : 0;
  const shockMachAngleDeg = mach > 1 ? (Math.asin(1 / mach) * 180) / Math.PI : null;
  const messages: string[] = [];

  if (Math.abs(loadFactor - 1) > 0.15) {
    messages.push(
      loadFactor < 1
        ? "At this speed and angle, the simple lift estimate is below one-g level flight; pitch, speed, or configuration must change."
        : "The selected point produces more than one-g lift in this simple estimate; a trim and load analysis is still required.",
    );
  }
  if (config.angleOfAttackDeg > 12) {
    messages.push("High angle of attack: separated flow and stall dominate, outside the reliable range of this low-order model.");
  }
  if (mach >= 0.78 && mach <= 1.2) {
    messages.push("Transonic flow: local shocks and separation require compressible CFD and wind-tunnel or flight data.");
  }
  if (mach > 1.2) {
    messages.push("Supersonic point: the Mach-angle cue is geometric only; wave drag and heating need a full compressible analysis.");
  }
  if (
    mach > 0.9 &&
    (config.modules["contact-array"] || config.modules["observer-pod"])
  ) {
    messages.push("Protruding contact hardware conflicts with the high-speed configuration unless retracted or re-faired.");
  }
  if (modulePowerKw > SYSTEM_POWER_BUDGET_KW) {
    messages.push("Selected modules exceed the stated 90 kW non-propulsive electrical budget.");
  }
  if (config.modules["bio-isolation"]) {
    messages.push("Filtration and isolation reduce known particulate exposure; they are not an antibiotic shield and cannot guarantee protection from unknown biology.");
  }
  if (config.modules["radiation-liner"]) {
    messages.push("Localized shielding can reduce some dose pathways, but it is not a universal shield against energetic particles or unknown radiation.");
  }
  if (config.modules["anomaly-detector"]) {
    messages.push("The field monitor is explicitly fictional: there is no validated detector for unknown alien physics.");
  }

  let state: ContactFlightResult["state"] = "balanced-study-point";
  if (messages.length > 0) state = "attention-required";
  if (config.angleOfAttackDeg > 15 || mach > 1.5) state = "outside-simple-model";

  return {
    ...atmosphere,
    mach,
    dynamicPressurePa,
    reynoldsNumber,
    liftCoefficient,
    dragCoefficient,
    liftN,
    dragN,
    liftToDrag,
    weightN,
    loadFactor,
    totalMassKg,
    moduleMassKg,
    modulePowerKw,
    moduleDragIncrement,
    estimatedThrustRequiredN: dragN,
    shockMachAngleDeg,
    state,
    messages,
  };
}

export function configurationWithScenarioSuggestions(
  input: ContactFlightConfiguration,
): ContactFlightConfiguration {
  const config = normalizeContactFlightConfiguration(input);
  const suggested = new Set(SCENARIO_SUGGESTIONS[config.scenario]);
  return {
    ...config,
    modules: Object.fromEntries(
      CONTACT_MODULES.map((module) => [module.id, suggested.has(module.id)]),
    ) as Record<ContactModuleId, boolean>,
  };
}
