import type { OrbitDirection, ProbeKind } from "./model";

export interface BlackHolePreset {
  id: "stellar" | "sagittarius-a" | "m87";
  name: string;
  shortName: string;
  massSolar: number;
  illustrativeSpin: number;
  note: string;
  sourceIds: string[];
}

export const blackHolePresets: readonly BlackHolePreset[] = [
  {
    id: "stellar",
    name: "Generic stellar-mass black hole",
    shortName: "Stellar · 10 M☉",
    massSolar: 10,
    illustrativeSpin: 0.7,
    note: "A scale study, not a named observed object. Mass and spin are intentionally editable assumptions.",
    sourceIds: ["nasa-overview"],
  },
  {
    id: "sagittarius-a",
    name: "Sagittarius A*",
    shortName: "Sgr A* · 4.30 million M☉",
    massSolar: 4.297e6,
    illustrativeSpin: 0.5,
    note: "Mass follows GRAVITY stellar-orbit measurements. The 0.50 spin is illustrative, not an accepted measured value.",
    sourceIds: ["gravity-2022", "eht-sgra-2022"],
  },
  {
    id: "m87",
    name: "M87*",
    shortName: "M87* · 6.5 billion M☉",
    massSolar: 6.5e9,
    illustrativeSpin: 0.9,
    note: "Mass follows the 2019 EHT analysis. The 0.90 spin is a visualization assumption; the first image did not uniquely measure spin.",
    sourceIds: ["eht-m87-2019"],
  },
] as const;

export interface BlackHoleReference {
  id: string;
  title: string;
  organization: string;
  publicationDate: string;
  url: string;
  supports: string;
  caveat?: string;
}

export const blackHoleReferences: readonly BlackHoleReference[] = [
  {
    id: "bardeen-1972",
    title: "Rotating black holes: locally nonrotating frames, energy extraction, and scalar synchrotron radiation",
    organization: "Bardeen, Press & Teukolsky · The Astrophysical Journal",
    publicationDate: "1972-12-01",
    url: "https://doi.org/10.1086/151796",
    supports: "Equatorial Kerr circular-orbit structure, including the standard ISCO expressions used here.",
  },
  {
    id: "eht-m87-2019",
    title: "First M87 Event Horizon Telescope Results VI: The Shadow and Mass of the Central Black Hole",
    organization: "Event Horizon Telescope Collaboration",
    publicationDate: "2019-04-10",
    url: "https://doi.org/10.3847/2041-8213/ab1141",
    supports: "The approximately 6.5-billion-solar-mass M87* preset and the distinction between an observed emission ring/shadow and the event horizon itself.",
  },
  {
    id: "eht-sgra-2022",
    title: "First Sagittarius A* Event Horizon Telescope Results I: The Shadow of the Supermassive Black Hole in the Center of the Milky Way",
    organization: "Event Horizon Telescope Collaboration",
    publicationDate: "2022-05-12",
    url: "https://doi.org/10.3847/2041-8213/ac6674",
    supports: "Horizon-scale observations of Sagittarius A* and the interpretation of a lensed emission ring around a Kerr-consistent compact object.",
  },
  {
    id: "gravity-2022",
    title: "Mass distribution in the Galactic Center based on interferometric astrometry of multiple stellar orbits",
    organization: "GRAVITY Collaboration · Astronomy & Astrophysics",
    publicationDate: "2022-01-19",
    url: "https://doi.org/10.1051/0004-6361/202142465",
    supports: "The Sagittarius A* mass preset of 4.297 million solar masses from stellar-orbit fitting.",
  },
  {
    id: "eht-sgra-polarization-2024",
    title: "First Sagittarius A* Event Horizon Telescope Results VII: Polarization of the Ring",
    organization: "Event Horizon Telescope Collaboration",
    publicationDate: "2024-03-27",
    url: "https://doi.org/10.3847/2041-8213/ad2df0",
    supports: "Polarized horizon-scale emission tracing an organized magnetic-field structure around Sagittarius A*.",
    caveat: "The result constrains emitting plasma and magnetic structure; it does not directly image the horizon or establish a visible jet from Sagittarius A*.",
  },
  {
    id: "nasa-overview",
    title: "Black Holes",
    organization: "NASA Science",
    publicationDate: "Page date not stated",
    url: "https://science.nasa.gov/universe/black-holes/",
    supports: "Accessible definitions of event horizons, accretion emission, tidal stretching, and why black holes are not cosmic vacuum cleaners.",
    caveat: "Educational overview rather than the source of the Kerr equations.",
  },
] as const;

export const verificationDate = "2026-09-30";

export const defaultBlackHoleConfiguration = {
  presetId: "sagittarius-a" as BlackHolePreset["id"],
  massSolar: 4.297e6,
  spin: 0.5,
  radiusRg: 7,
  direction: "prograde" as OrbitDirection,
  probeKind: "spacecraft" as ProbeKind,
  speed: 1,
};
