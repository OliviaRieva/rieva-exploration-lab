/**
 * The public brand lives here so the project can be renamed without hunting
 * through UI components. “Rievastra” combines Rieva with the Latin “astra”.
 */
export const siteConfig = {
  name: "Rievastra",
  wordmark: "RIEVA//STRA",
  descriptor: "Orbital Mission Laboratory",
  title: "Rievastra — Orbital Mission Laboratory",
  description:
    "An interactive, transparent electric-propulsion mission simulator for comparing uninterrupted and power-loss orbital transfers.",
  tagline: "Low-thrust trajectories, made inspectable.",
  defaultMissionName: "LEO → higher-orbit power-loss study",
} as const;
