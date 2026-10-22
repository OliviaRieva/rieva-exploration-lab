export type CentralBodyId =
  | "mercury"
  | "venus"
  | "earth"
  | "moon"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune";

export interface CentralBodyDefinition {
  id: CentralBodyId;
  name: string;
  gravitationalParameterM3S2: number;
  meanRadiusM: number;
  solarDistanceAu: number;
  rotationPeriodS: number;
  initialAltitudeKm: number;
  targetAltitudeKm: number;
  missionDurationDays: number;
  surfaceKind: "solid" | "reference-level";
  visual: {
    light: string;
    mid: string;
    dark: string;
    atmosphere: string;
  };
  note: string;
}

/**
 * Radius values follow NASA/JPL mean-radius tables. GM values are standard
 * mission-design constants rounded to an appropriate educational precision.
 * Giant-planet altitude is relative to the catalogued mean/reference radius,
 * not a solid surface.
 */
export const centralBodies: readonly CentralBodyDefinition[] = [
  {
    id: "mercury",
    name: "Mercury",
    gravitationalParameterM3S2: 2.2032e13,
    meanRadiusM: 2_439_400,
    solarDistanceAu: 0.387,
    rotationPeriodS: 58.6462 * 86_400,
    initialAltitudeKm: 180,
    targetAltitudeKm: 700,
    missionDurationDays: 12,
    surfaceKind: "solid",
    visual: { light: "#ddd4c7", mid: "#8d8178", dark: "#312b31", atmosphere: "rgba(223, 204, 190, 0.08)" },
    note: "Airless and close to the Sun. Solar heating, radiation pressure, and third-body gravity are not included in this local two-body run.",
  },
  {
    id: "venus",
    name: "Venus",
    gravitationalParameterM3S2: 3.2486e14,
    meanRadiusM: 6_051_800,
    solarDistanceAu: 0.723,
    rotationPeriodS: -243.018 * 86_400,
    initialAltitudeKm: 350,
    targetAltitudeKm: 1_800,
    missionDurationDays: 12,
    surfaceKind: "solid",
    visual: { light: "#fff0bd", mid: "#c88b55", dark: "#623c52", atmosphere: "rgba(255, 198, 128, 0.28)" },
    note: "The real upper atmosphere and solar environment matter. This model omits drag, winds, heating, and solar perturbations.",
  },
  {
    id: "earth",
    name: "Earth",
    gravitationalParameterM3S2: 3.986_004_418e14,
    meanRadiusM: 6_371_000,
    solarDistanceAu: 1,
    rotationPeriodS: 86_164.1,
    initialAltitudeKm: 450,
    targetAltitudeKm: 2_000,
    missionDurationDays: 10,
    surfaceKind: "solid",
    visual: { light: "#74e4ff", mid: "#247db8", dark: "#09274c", atmosphere: "rgba(94, 210, 255, 0.26)" },
    note: "The validated baseline. Below roughly 200 km, omitted atmospheric drag becomes especially important.",
  },
  {
    id: "moon",
    name: "Moon",
    gravitationalParameterM3S2: 4.902_800_118e12,
    meanRadiusM: 1_737_400,
    solarDistanceAu: 1,
    rotationPeriodS: 27.321_661 * 86_400,
    initialAltitudeKm: 100,
    targetAltitudeKm: 500,
    missionDurationDays: 6,
    surfaceKind: "solid",
    visual: { light: "#f1eee9", mid: "#aaa6aa", dark: "#3d3b4b", atmosphere: "rgba(214, 210, 225, 0.06)" },
    note: "A spherical Moon is used. Mascons, Earth/Sun perturbations, eclipses, and low-orbit stability limits are omitted.",
  },
  {
    id: "mars",
    name: "Mars",
    gravitationalParameterM3S2: 4.282_837_362e13,
    meanRadiusM: 3_389_500,
    solarDistanceAu: 1.524,
    rotationPeriodS: 88_642.7,
    initialAltitudeKm: 300,
    targetAltitudeKm: 1_500,
    missionDurationDays: 12,
    surfaceKind: "solid",
    visual: { light: "#ffc49d", mid: "#bb604c", dark: "#4b2533", atmosphere: "rgba(255, 152, 111, 0.17)" },
    note: "Mars still has an atmosphere. Drag, oblateness, moons, dust, eclipses, and Sun gravity are omitted here.",
  },
  {
    id: "jupiter",
    name: "Jupiter",
    gravitationalParameterM3S2: 1.266_865_319e17,
    meanRadiusM: 69_911_000,
    solarDistanceAu: 5.203,
    rotationPeriodS: 35_730,
    initialAltitudeKm: 8_000,
    targetAltitudeKm: 35_000,
    missionDurationDays: 30,
    surfaceKind: "reference-level",
    visual: { light: "#ffe1bd", mid: "#b98673", dark: "#50364e", atmosphere: "rgba(255, 191, 144, 0.22)" },
    note: "There is no solid surface at the reference radius. Radiation, oblateness, moons, rings, and atmospheric entry physics are omitted.",
  },
  {
    id: "saturn",
    name: "Saturn",
    gravitationalParameterM3S2: 3.793_120_623e16,
    meanRadiusM: 58_232_000,
    solarDistanceAu: 9.537,
    rotationPeriodS: 38_362,
    initialAltitudeKm: 80_000,
    targetAltitudeKm: 100_000,
    missionDurationDays: 30,
    surfaceKind: "reference-level",
    visual: { light: "#fff0bd", mid: "#c9ae79", dark: "#5a4954", atmosphere: "rgba(255, 222, 157, 0.2)" },
    note: "Altitude is above a reference radius, not ground. The default starts beyond the main bright rings, but diffuse rings, moons, atmospheric entry, and strong oblateness are still omitted.",
  },
  {
    id: "uranus",
    name: "Uranus",
    gravitationalParameterM3S2: 5.793_951_3e15,
    meanRadiusM: 25_362_000,
    solarDistanceAu: 19.19,
    rotationPeriodS: -62_064,
    initialAltitudeKm: 5_000,
    targetAltitudeKm: 20_000,
    missionDurationDays: 30,
    surfaceKind: "reference-level",
    visual: { light: "#c7fbff", mid: "#6bbdc9", dark: "#285268", atmosphere: "rgba(123, 231, 245, 0.2)" },
    note: "Altitude is referenced to the mean radius. Rings, moons, winds, oblateness, and solar-transfer dynamics are omitted.",
  },
  {
    id: "neptune",
    name: "Neptune",
    gravitationalParameterM3S2: 6.835_099_97e15,
    meanRadiusM: 24_622_000,
    solarDistanceAu: 30.07,
    rotationPeriodS: 57_996,
    initialAltitudeKm: 5_000,
    targetAltitudeKm: 20_000,
    missionDurationDays: 30,
    surfaceKind: "reference-level",
    visual: { light: "#8cc8ff", mid: "#3e69d4", dark: "#182d67", atmosphere: "rgba(83, 132, 255, 0.22)" },
    note: "Altitude is referenced to the mean radius. Triton, rings, winds, oblateness, and solar-transfer dynamics are omitted.",
  },
] as const;

const centralBodyById = new Map<CentralBodyId, CentralBodyDefinition>(
  centralBodies.map((body) => [body.id, body]),
);
const defaultCentralBody = centralBodyById.get("earth")!;

export function getCentralBody(id: CentralBodyId): CentralBodyDefinition {
  return centralBodyById.get(id) ?? defaultCentralBody;
}

export type SpacecraftDesignId = "ion-scout" | "hall-tug" | "cargo-spiraler";

export interface SpacecraftDesign {
  id: SpacecraftDesignId;
  name: string;
  description: string;
  dryMassKg: number;
  propellantMassKg: number;
  powerKw: number;
  specificImpulseS: number;
  efficiencyPct: number;
  evidence: string;
}

export const spacecraftDesigns: readonly SpacecraftDesign[] = [
  {
    id: "ion-scout",
    name: "Ion Scout",
    description: "Light probe bus with a high-Isp gridded-ion-style assumption.",
    dryMassKg: 520,
    propellantMassKg: 62,
    powerKw: 9,
    specificImpulseS: 3_000,
    efficiencyPct: 67,
    evidence: "Illustrative vehicle envelope; propulsion numbers are editable model assumptions, not a named flight system.",
  },
  {
    id: "hall-tug",
    name: "Hall-Effect Tug",
    description: "Twin-array orbital tug tuned for stronger thrust at moderate specific impulse.",
    dryMassKg: 800,
    propellantMassKg: 100,
    powerKw: 15,
    specificImpulseS: 1_800,
    efficiencyPct: 65,
    evidence: "The baseline educational case. The visible plume is exaggerated because real electric-propulsion plumes are faint in visible light.",
  },
  {
    id: "cargo-spiraler",
    name: "Cargo Spiraler",
    description: "Larger solar-electric cargo bus with more power, mass, and propellant.",
    dryMassKg: 2_400,
    propellantMassKg: 420,
    powerKw: 60,
    specificImpulseS: 2_200,
    efficiencyPct: 64,
    evidence: "Original mission-study concept. It is not a flight-qualified vehicle or launch rocket.",
  },
] as const;

export interface ExoplanetResearchTarget {
  name: string;
  type: string;
  whyInteresting: string;
  honestBoundary: string;
  sourceUrl: string;
  sourceLabel: string;
  publicationDate: string;
  verifiedDate: string;
}

export const exoplanetResearchTargets: readonly ExoplanetResearchTarget[] = [
  {
    name: "TRAPPIST-1 e",
    type: "Temperate, roughly Earth-sized research target",
    whyInteresting: "Webb observations are testing whether this compact system's rocky planets retain atmospheres.",
    honestBoundary: "As of the cited NASA December 2025 status, a thick hydrogen atmosphere is ruled out for e, while atmospheric interpretation remains under study; no life has been detected.",
    sourceUrl: "https://science.nasa.gov/mission/webb/science-overview/science-explainers/what-is-webb-revealing-about-the-trappist-1-system/",
    sourceLabel: "NASA Webb status",
    publicationDate: "December 2025",
    verifiedDate: "30 September 2026",
  },
  {
    name: "TOI-700 e",
    type: "Confirmed terrestrial-size exoplanet",
    whyInteresting: "A 0.919-Earth-radius world in a system with multiple small planets, useful for comparative atmosphere studies.",
    honestBoundary: "Being in a habitable-zone region is not evidence of oceans, an atmosphere, habitability, or life.",
    sourceUrl: "https://science.nasa.gov/exoplanet-catalog/toi-700-e/",
    sourceLabel: "NASA Exoplanet Catalog",
    publicationDate: "Catalog page; publication date not stated",
    verifiedDate: "30 September 2026",
  },
  {
    name: "K2-18 b",
    type: "Temperate sub-Neptune atmosphere target",
    whyInteresting: "Webb detected methane and carbon dioxide, making the atmosphere a valuable test of retrieval methods and planet models.",
    honestBoundary: "NASA notes that an ocean remains a theoretical suggestion without direct observational evidence; it is not an Earth twin and no alien life has been found.",
    sourceUrl: "https://science.nasa.gov/blogs/webb/2024/06/05/reconnaissance-of-potentially-habitable-worlds-with-nasas-webb/",
    sourceLabel: "NASA Webb research note",
    publicationDate: "5 June 2024",
    verifiedDate: "30 September 2026",
  },
  {
    name: "TOI-715 b",
    type: "Habitable-zone super-Earth candidate for follow-up",
    whyInteresting: "Its location and host star make it a useful target for future atmospheric characterization.",
    honestBoundary: "The orbit's zone only permits the temperature possibility for liquid water under suitable conditions; surface water and life are unconfirmed.",
    sourceUrl: "https://science.nasa.gov/universe/exoplanets/discovery-alert-a-super-earth-in-the-habitable-zone/",
    sourceLabel: "NASA discovery alert",
    publicationDate: "31 January 2024",
    verifiedDate: "30 September 2026",
  },
] as const;
