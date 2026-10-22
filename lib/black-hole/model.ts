export const GRAVITATIONAL_CONSTANT = 6.6743e-11;
export const SPEED_OF_LIGHT_MPS = 299_792_458;
export const SOLAR_MASS_KG = 1.98847e30;

const SOLAR_GRAVITATIONAL_RADIUS_KM =
  (GRAVITATIONAL_CONSTANT * SOLAR_MASS_KG) /
  SPEED_OF_LIGHT_MPS ** 2 /
  1_000;
const SOLAR_GRAVITATIONAL_TIME_S =
  (GRAVITATIONAL_CONSTANT * SOLAR_MASS_KG) / SPEED_OF_LIGHT_MPS ** 3;

export type OrbitDirection = "prograde" | "retrograde";
export type ProbeKind = "spacecraft" | "astronaut" | "star" | "photon";

export interface KerrRadii {
  horizonRg: number;
  staticLimitEquatorRg: number;
  progradePhotonRg: number;
  retrogradePhotonRg: number;
  progradeIscoRg: number;
  retrogradeIscoRg: number;
}

export interface ProbeDefinition {
  id: ProbeKind;
  name: string;
  lengthM: number;
  description: string;
}

export const probeDefinitions: Readonly<Record<ProbeKind, ProbeDefinition>> = {
  spacecraft: {
    id: "spacecraft",
    name: "12 m research craft",
    lengthM: 12,
    description: "A compact unpowered test craft. Propulsion, shielding, and structural limits are not modeled.",
  },
  astronaut: {
    id: "astronaut",
    name: "2 m astronaut",
    lengthM: 2,
    description: "A human-scale marker used only to compare tidal acceleration across body length.",
  },
  star: {
    id: "star",
    name: "Sun-size star",
    lengthM: 1.3914e9,
    description: "A solar-diameter marker. Stellar fluid response and disruption dynamics are not integrated.",
  },
  photon: {
    id: "photon",
    name: "Photon",
    lengthM: 0,
    description: "A massless test particle used to locate the unstable equatorial circular photon orbit.",
  },
};

export interface OrbitAssessmentInput {
  massSolar: number;
  spin: number;
  radiusRg: number;
  direction: OrbitDirection;
  probeKind: ProbeKind;
}

export type OrbitRegime =
  | "captured"
  | "no-timelike-circle"
  | "unstable"
  | "marginal-isco"
  | "stable-circular-allowed"
  | "critical-photon-orbit"
  | "photon-flyby";

export interface OrbitAssessment {
  regime: OrbitRegime;
  tone: "critical" | "warning" | "nominal" | "informational";
  title: string;
  summary: string;
  selectedIscoRg: number;
  selectedPhotonRg: number;
  tidalDifferentialMps2: number | null;
  tidalBand: "not-applicable" | "below-1g" | "above-1g" | "above-10g" | "above-1000g";
  tidalNote: string;
  orbitalPeriodSeconds: number | null;
  animationMode: "orbit" | "precess" | "plunge" | "photon";
}

export function clampSpin(spin: number) {
  if (!Number.isFinite(spin)) return 0;
  return Math.min(0.999, Math.max(0, Math.abs(spin)));
}

export function gravitationalRadiusKm(massSolar: number) {
  if (!Number.isFinite(massSolar) || massSolar <= 0) return 0;
  // Multiplying by the one-solar-mass scale avoids overflowing the
  // intermediate kilogram value for otherwise representable large inputs.
  return SOLAR_GRAVITATIONAL_RADIUS_KM * massSolar;
}

export function lightCrossingTimeSeconds(massSolar: number) {
  return gravitationalRadiusKm(massSolar) * 1_000 / SPEED_OF_LIGHT_MPS;
}

export function ergosphereRadiusRg(spinInput: number, polarAngleRad: number) {
  const spin = clampSpin(spinInput);
  const cosine = Math.cos(Number.isFinite(polarAngleRad) ? polarAngleRad : 0);
  return 1 + Math.sqrt(Math.max(0, 1 - spin ** 2 * cosine ** 2));
}

export function kerrRadii(spinInput: number): KerrRadii {
  const spin = clampSpin(spinInput);
  const oneMinusSpinSquared = Math.max(0, 1 - spin ** 2);
  const z1 =
    1 +
    Math.cbrt(oneMinusSpinSquared) *
      (Math.cbrt(1 + spin) + Math.cbrt(1 - spin));
  const z2 = Math.sqrt(3 * spin ** 2 + z1 ** 2);
  const radical = Math.sqrt(
    Math.max(0, (3 - z1) * (3 + z1 + 2 * z2)),
  );

  return {
    horizonRg: 1 + Math.sqrt(oneMinusSpinSquared),
    staticLimitEquatorRg: 2,
    progradePhotonRg:
      2 * (1 + Math.cos((2 / 3) * Math.acos(-spin))),
    retrogradePhotonRg:
      2 * (1 + Math.cos((2 / 3) * Math.acos(spin))),
    progradeIscoRg: 3 + z2 - radical,
    retrogradeIscoRg: 3 + z2 + radical,
  };
}

export function radiusRgToKm(radiusRg: number, massSolar: number) {
  if (!Number.isFinite(radiusRg) || radiusRg <= 0) return 0;
  return radiusRg * gravitationalRadiusKm(massSolar);
}

/**
 * Newtonian radial differential acceleration, 2GM L / r^3. This is a useful
 * scale comparison, not a relativistic structural-load calculation.
 */
export function approximateTidalDifferentialMps2(
  massSolar: number,
  radiusRg: number,
  lengthM: number,
) {
  if (
    !Number.isFinite(lengthM) ||
    !Number.isFinite(massSolar) ||
    !Number.isFinite(radiusRg) ||
    lengthM <= 0 ||
    massSolar <= 0 ||
    radiusRg <= 0
  ) {
    return 0;
  }
  const gravitationalRadiusM = gravitationalRadiusKm(massSolar) * 1_000;
  const result =
    (2 * SPEED_OF_LIGHT_MPS ** 2 * lengthM) /
    (radiusRg ** 3 * gravitationalRadiusM ** 2);
  return Number.isNaN(result) ? 0 : result;
}

export function equatorialCircularPeriodSeconds(
  massSolar: number,
  radiusRg: number,
  spinInput: number,
  direction: OrbitDirection,
) {
  if (
    !Number.isFinite(massSolar) ||
    !Number.isFinite(radiusRg) ||
    massSolar <= 0 ||
    radiusRg <= 0
  ) {
    return null;
  }
  const spin = clampSpin(spinInput);
  const signedSpin = direction === "retrograde" ? -spin : spin;
  const denominator = radiusRg ** 1.5 + signedSpin;
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  const geometricTime = SOLAR_GRAVITATIONAL_TIME_S * massSolar;
  return 2 * Math.PI * geometricTime * denominator;
}

function tidalBandFor(value: number | null): OrbitAssessment["tidalBand"] {
  if (value === null) return "not-applicable";
  if (value >= 9_810) return "above-1000g";
  if (value >= 98.1) return "above-10g";
  if (value >= 9.81) return "above-1g";
  return "below-1g";
}

export function assessOrbit(input: OrbitAssessmentInput): OrbitAssessment {
  const massSolar =
    Number.isFinite(input.massSolar) && input.massSolar > 0
      ? Math.max(0.1, input.massSolar)
      : 0.1;
  const spin = clampSpin(input.spin);
  const direction: OrbitDirection =
    input.direction === "retrograde" ? "retrograde" : "prograde";
  const probeKind: ProbeKind = Object.prototype.hasOwnProperty.call(
    probeDefinitions,
    input.probeKind,
  )
    ? input.probeKind
    : "spacecraft";
  const radii = kerrRadii(spin);
  const selectedIscoRg =
    direction === "prograde"
      ? radii.progradeIscoRg
      : radii.retrogradeIscoRg;
  const selectedPhotonRg =
    direction === "prograde"
      ? radii.progradePhotonRg
      : radii.retrogradePhotonRg;
  const radiusRg =
    Number.isFinite(input.radiusRg) && input.radiusRg > 0
      ? Math.max(0.1, input.radiusRg)
      : 0.1;
  const definition = probeDefinitions[probeKind];
  const coordinateRadiusM = radiusRgToKm(radiusRg, massSolar) * 1_000;
  const extentRatio =
    coordinateRadiusM > 0 ? definition.lengthM / coordinateRadiusM : Infinity;
  const outsideLocalTidalDomain =
    probeKind !== "photon" && extentRatio > 0.1;
  const tidalDifferentialMps2 =
    probeKind === "photon" || outsideLocalTidalDomain
      ? null
      : approximateTidalDifferentialMps2(
          massSolar,
          radiusRg,
          definition.lengthM,
        );
  const tidalBand = tidalBandFor(tidalDifferentialMps2);
  const tidalNote =
    probeKind === "photon"
      ? "Tidal acceleration across a finite body does not apply to this photon marker."
      : outsideLocalTidalDomain
        ? "Not estimated: the selected object is too large compared with this coordinate radius for the local small-separation approximation. A relativistic extended-body model would be required."
        : tidalDifferentialMps2 === null
          ? "The local tidal scale is not available for this selection."
      : tidalBand === "below-1g"
        ? "The Newtonian local scale estimate is below 1 Earth g across the selected object's stated length. Near the horizon, a relativistic treatment is required."
        : `${tidalBand.replace("above-", "Above ").replace("g", " g")} across the selected length in the Newtonian local estimate. Near the horizon this is not a relativistic load calculation or structural certification limit.`;

  const shared = {
    selectedIscoRg,
    selectedPhotonRg,
    tidalDifferentialMps2,
    tidalBand,
    tidalNote,
  };

  if (radiusRg <= radii.horizonRg) {
    return {
      ...shared,
      regime: "captured",
      tone: "critical",
      title: "At or inside the outer event horizon",
      summary:
        "No future-directed path returns to the exterior. The animation shows capture schematically; it is not a view through the horizon.",
      orbitalPeriodSeconds: null,
      animationMode: "plunge",
    };
  }

  if (probeKind === "photon") {
    const fractionalOffset = Math.abs(radiusRg - selectedPhotonRg) / selectedPhotonRg;
    if (fractionalOffset <= 1e-6) {
      return {
        ...shared,
        regime: "critical-photon-orbit",
        tone: "warning",
        title: "Unstable circular photon orbit",
        summary:
          "This is the equatorial critical light orbit. An arbitrarily small perturbation sends the photon inward or outward; it is not a parking orbit.",
        orbitalPeriodSeconds: null,
        animationMode: "photon",
      };
    }
    if (fractionalOffset <= 0.025) {
      return {
        ...shared,
        regime: "photon-flyby",
        tone: "warning",
        title: "Near the critical photon radius",
        summary:
          "Only the exact critical radius supports the unstable circular null geodesic. This nearby marker is staged as a flyby; its real path also depends on initial direction and impact parameter.",
        orbitalPeriodSeconds: null,
        animationMode: "photon",
      };
    }
    return {
      ...shared,
      regime: "photon-flyby",
      tone: radiusRg < selectedPhotonRg ? "critical" : "informational",
      title:
        radiusRg < selectedPhotonRg
          ? "No exterior circular photon path here"
          : "Photon flyby, not a circular orbit",
      summary:
        radiusRg < selectedPhotonRg
          ? "At this equatorial radius the chosen direction has no circular null orbit. Capture or escape depends on the photon's initial direction and impact parameter; the staged inward motion is only one illustration."
          : "A photon can pass through this radius, but a free circular light orbit exists only at the critical photon radius.",
      orbitalPeriodSeconds: null,
      animationMode: radiusRg < selectedPhotonRg ? "plunge" : "photon",
    };
  }

  if (radiusRg <= selectedPhotonRg) {
    return {
      ...shared,
      regime: "no-timelike-circle",
      tone: "critical",
      title: "No timelike circular orbit",
      summary:
        "A massive craft cannot follow a free circular geodesic at or below the selected equatorial photon orbit. Its actual path depends on its initial four-velocity; the scene stages one possible inward trajectory.",
      orbitalPeriodSeconds: null,
      animationMode: "plunge",
    };
  }

  const isAtIsco =
    Math.abs(radiusRg - selectedIscoRg) /
      Math.max(selectedIscoRg, Number.EPSILON) <=
    1e-6;
  if (isAtIsco) {
    return {
      ...shared,
      regime: "marginal-isco",
      tone: "warning",
      title: "Marginal circular orbit at the ISCO",
      summary:
        "This is the innermost stable circular-orbit boundary: radial stability is marginal. Vehicle survival and a maintained orbit require trajectory, control, and environment models beyond this lab.",
      orbitalPeriodSeconds: equatorialCircularPeriodSeconds(
        massSolar,
        radiusRg,
        spin,
        direction,
      ),
      animationMode: "orbit",
    };
  }

  if (radiusRg < selectedIscoRg) {
    return {
      ...shared,
      regime: "unstable",
      tone: "warning",
      title: "Unstable circular-orbit region",
      summary:
        "Circular geodesics can be written here, but radial perturbations grow. The oscillating scene only signals instability; a real outcome depends on the initial state and requires a Kerr trajectory and control model.",
      orbitalPeriodSeconds: null,
      animationMode: "precess",
    };
  }

  return {
    ...shared,
    regime: "stable-circular-allowed",
    tone:
      tidalBand === "above-10g" || tidalBand === "above-1000g"
        ? "warning"
        : "nominal",
    title:
      tidalBand === "above-10g" || tidalBand === "above-1000g"
        ? "Orbit permitted; tidal gradient is large"
        : "Stable circular geodesic permitted",
    summary:
      "The Kerr test-particle model permits an equatorial circular orbit here. That does not establish vehicle survivability, navigation, or station-keeping performance.",
    orbitalPeriodSeconds: equatorialCircularPeriodSeconds(
      massSolar,
      radiusRg,
      spin,
      direction,
    ),
    animationMode: "orbit",
  };
}
