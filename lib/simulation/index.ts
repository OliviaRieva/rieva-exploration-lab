/**
 * Framework-independent planar central-body orbit simulation.
 *
 * All inputs and state variables use SI units. The numerical model is a
 * spherical, isolated two-body gravity plus ideal, constant-power electric
 * propulsion. Earth remains the validated default, while the same equations
 * can use catalogued radius and GM values for other Solar System bodies.
 * Keeping this module free of browser and React APIs makes the same equations
 * usable by the UI, a Web Worker, and the automated validation suite.
 */

export const EARTH = Object.freeze({
  gravitationalParameterM3S2: 3.986_004_418e14,
  meanRadiusM: 6_371_000,
  standardGravityMps2: 9.806_65,
});

export const SECONDS_PER_DAY = 86_400;

export const DEFAULT_SOLVER_SETTINGS: Readonly<SolverSettings> = Object.freeze({
  internalStepS: 20,
  outputStepS: 60,
  semimajorAxisToleranceM: 10_000,
  eccentricityTolerance: 0.005,
  eventTimeToleranceS: 0.01,
});

export const DEFAULT_MISSION_PARAMETERS: Readonly<MissionParameters> =
  Object.freeze({
    centralBodyRadiusM: EARTH.meanRadiusM,
    centralBodyGravitationalParameterM3S2: EARTH.gravitationalParameterM3S2,
    initialAltitudeM: 450_000,
    targetAltitudeM: 2_000_000,
    dryMassKg: 800,
    propellantMassKg: 100,
    powerW: 15_000,
    specificImpulseS: 1_800,
    efficiency: 0.65,
    interruptionStartS: 60 * 3_600,
    interruptionDurationS: 18 * 3_600,
    maxDurationS: 10 * SECONDS_PER_DAY,
  });

export const PHASE = Object.freeze({
  THRUSTING: 0,
  INTERRUPTION: 1,
  TARGET_COAST: 2,
  PROPELLANT_DEPLETED: 3,
  COASTING: 4,
  BODY_IMPACT: 5,
});

export type PhaseCode = (typeof PHASE)[keyof typeof PHASE];
export type ScenarioKind = "reference" | "interrupted";

export interface MissionParameters {
  centralBodyRadiusM: number;
  centralBodyGravitationalParameterM3S2: number;
  initialAltitudeM: number;
  targetAltitudeM: number;
  dryMassKg: number;
  propellantMassKg: number;
  powerW: number;
  specificImpulseS: number;
  efficiency: number;
  interruptionStartS: number;
  interruptionDurationS: number;
  maxDurationS: number;
}

export interface SolverSettings {
  internalStepS: number;
  outputStepS: number;
  semimajorAxisToleranceM: number;
  eccentricityTolerance: number;
  eventTimeToleranceS: number;
}

export interface DynamicState {
  xM: number;
  yM: number;
  vxMps: number;
  vyMps: number;
  propellantKg: number;
}

export interface OrbitalElements {
  radiusM: number;
  speedMps: number;
  semimajorAxisM: number;
  eccentricity: number;
  specificEnergyJkg: number;
  specificAngularMomentumM2ps: number;
}

export interface ValidationIssue {
  field: keyof MissionParameters | keyof SolverSettings | "simulation";
  message: string;
}

export type SimulationEventType =
  | "interruption-start"
  | "interruption-end"
  | "target-thrust-cutoff"
  | "propellant-depleted"
  | "body-impact";

export interface SimulationEvent {
  type: SimulationEventType;
  timeS: number;
}

/**
 * Column-oriented plain arrays are deliberately used here. They are cheap to
 * structured-clone from a worker, JSON-safe for all normal mission results,
 * and can be written directly to CSV without reconstructing sample objects.
 */
export interface ScenarioSeries {
  xM: number[];
  yM: number[];
  vxMps: number[];
  vyMps: number[];
  altitudeM: number[];
  speedMps: number[];
  propellantKg: number[];
  thrustN: number[];
  semimajorAxisM: number[];
  eccentricity: number[];
  phase: PhaseCode[];
  validLength: number;
}

export type TerminalReason =
  | "target-met"
  | "duration-limit"
  | "propellant-depleted"
  | "body-impact";

export interface ScenarioSummary {
  scenario: ScenarioKind;
  targetMet: boolean;
  targetMetAtS: number | null;
  burnCutoffAtS: number | null;
  impactAtS: number | null;
  finalSemimajorAxisM: number;
  finalEccentricity: number;
  propellantUsedKg: number;
  terminalReason: TerminalReason;
  events: SimulationEvent[];
}

export interface ScenarioResult {
  series: ScenarioSeries;
  summary: ScenarioSummary;
}

export interface ComparisonResult {
  timeS: number[];
  reference: ScenarioResult;
  interrupted: ScenarioResult;
  parameters: MissionParameters;
  settings: SolverSettings;
  derived: PropulsionPerformance;
}

export interface PropulsionPerformance {
  exhaustVelocityMps: number;
  nominalThrustN: number;
  nominalMassFlowKgps: number;
  initialThrustAccelerationMps2: number;
}

export type ProgressCallback = (fraction: number) => void;

const TIME_EPSILON_S = 1e-8;
const MASS_EPSILON_KG = 1e-12;
const MAX_MISSION_DURATION_S = 120 * SECONDS_PER_DAY;
const MAX_INTERNAL_STEPS = 5_000_000;
const MAX_OUTPUT_SAMPLES = 250_000;

export class SimulationInputError extends Error {
  issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(" "));
    this.name = "SimulationInputError";
    this.issues = issues;
  }
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

export function resolveSolverSettings(
  overrides: Partial<SolverSettings> = {},
): SolverSettings {
  return { ...DEFAULT_SOLVER_SETTINGS, ...overrides };
}

export function validateMissionParameters(
  parameters: MissionParameters,
  settingsOverrides: Partial<SolverSettings> = {},
): ValidationIssue[] {
  const settings = resolveSolverSettings(settingsOverrides);
  const issues: ValidationIssue[] = [];

  const requireFinite = (
    field: keyof MissionParameters,
    value: number,
  ): boolean => {
    if (!isFiniteNumber(value)) {
      issues.push({ field, message: `${field} must be a finite number.` });
      return false;
    }
    return true;
  };

  const initialAltitudeIsFinite = requireFinite(
    "initialAltitudeM",
    parameters.initialAltitudeM,
  );
  const targetAltitudeIsFinite = requireFinite(
    "targetAltitudeM",
    parameters.targetAltitudeM,
  );
  const dryMassIsFinite = requireFinite("dryMassKg", parameters.dryMassKg);
  const propellantIsFinite = requireFinite(
    "propellantMassKg",
    parameters.propellantMassKg,
  );
  const powerIsFinite = requireFinite("powerW", parameters.powerW);
  const ispIsFinite = requireFinite(
    "specificImpulseS",
    parameters.specificImpulseS,
  );
  const efficiencyIsFinite = requireFinite(
    "efficiency",
    parameters.efficiency,
  );
  const interruptionStartIsFinite = requireFinite(
    "interruptionStartS",
    parameters.interruptionStartS,
  );
  const interruptionDurationIsFinite = requireFinite(
    "interruptionDurationS",
    parameters.interruptionDurationS,
  );
  const maxDurationIsFinite = requireFinite(
    "maxDurationS",
    parameters.maxDurationS,
  );
  const centralBodyRadiusIsFinite = requireFinite(
    "centralBodyRadiusM",
    parameters.centralBodyRadiusM,
  );
  const centralBodyMuIsFinite = requireFinite(
    "centralBodyGravitationalParameterM3S2",
    parameters.centralBodyGravitationalParameterM3S2,
  );

  if (centralBodyRadiusIsFinite && parameters.centralBodyRadiusM <= 0) {
    issues.push({
      field: "centralBodyRadiusM",
      message: "Central-body radius must be positive.",
    });
  }
  if (
    centralBodyMuIsFinite &&
    parameters.centralBodyGravitationalParameterM3S2 <= 0
  ) {
    issues.push({
      field: "centralBodyGravitationalParameterM3S2",
      message: "Central-body gravitational parameter must be positive.",
    });
  }

  if (initialAltitudeIsFinite && parameters.initialAltitudeM <= 0) {
    issues.push({
      field: "initialAltitudeM",
      message: "Initial altitude must be above the spherical central-body boundary.",
    });
  }
  if (
    initialAltitudeIsFinite &&
    targetAltitudeIsFinite &&
    parameters.targetAltitudeM <= parameters.initialAltitudeM
  ) {
    issues.push({
      field: "targetAltitudeM",
      message: "Target altitude must be higher than initial altitude.",
    });
  }
  if (dryMassIsFinite && parameters.dryMassKg <= 0) {
    issues.push({ field: "dryMassKg", message: "Dry mass must be positive." });
  }
  if (propellantIsFinite && parameters.propellantMassKg < 0) {
    issues.push({
      field: "propellantMassKg",
      message: "Propellant mass cannot be negative.",
    });
  }
  if (powerIsFinite && parameters.powerW < 0) {
    issues.push({ field: "powerW", message: "Electrical power cannot be negative." });
  }
  if (ispIsFinite && parameters.specificImpulseS <= 0) {
    issues.push({
      field: "specificImpulseS",
      message: "Specific impulse must be positive.",
    });
  }
  if (
    efficiencyIsFinite &&
    (parameters.efficiency < 0 || parameters.efficiency > 1)
  ) {
    issues.push({
      field: "efficiency",
      message: "Propulsion efficiency must lie between zero and one.",
    });
  }
  if (interruptionStartIsFinite && parameters.interruptionStartS < 0) {
    issues.push({
      field: "interruptionStartS",
      message: "Interruption start time cannot be negative.",
    });
  }
  if (
    interruptionDurationIsFinite &&
    parameters.interruptionDurationS < 0
  ) {
    issues.push({
      field: "interruptionDurationS",
      message: "Interruption duration cannot be negative.",
    });
  }
  if (maxDurationIsFinite && parameters.maxDurationS <= 0) {
    issues.push({
      field: "maxDurationS",
      message: "Maximum mission duration must be positive.",
    });
  } else if (
    maxDurationIsFinite &&
    parameters.maxDurationS > MAX_MISSION_DURATION_S
  ) {
    issues.push({
      field: "maxDurationS",
      message: "Maximum mission duration cannot exceed 120 days in this browser model.",
    });
  }

  const solverFields: Array<[keyof SolverSettings, number, string]> = [
    ["internalStepS", settings.internalStepS, "Internal integration step"],
    ["outputStepS", settings.outputStepS, "Output sampling step"],
    [
      "semimajorAxisToleranceM",
      settings.semimajorAxisToleranceM,
      "Semimajor-axis tolerance",
    ],
    [
      "eccentricityTolerance",
      settings.eccentricityTolerance,
      "Eccentricity tolerance",
    ],
    ["eventTimeToleranceS", settings.eventTimeToleranceS, "Event time tolerance"],
  ];
  for (const [field, value, label] of solverFields) {
    if (!isFiniteNumber(value) || value <= 0) {
      issues.push({ field, message: `${label} must be a positive finite number.` });
    }
  }

  if (
    maxDurationIsFinite &&
    settings.internalStepS > 0 &&
    parameters.maxDurationS / settings.internalStepS > MAX_INTERNAL_STEPS
  ) {
    issues.push({
      field: "internalStepS",
      message: "The requested internal step would exceed the browser computation limit.",
    });
  }
  if (
    maxDurationIsFinite &&
    settings.outputStepS > 0 &&
    parameters.maxDurationS / settings.outputStepS > MAX_OUTPUT_SAMPLES
  ) {
    issues.push({
      field: "outputStepS",
      message: "The requested output cadence would create too many browser samples.",
    });
  }

  return issues;
}

export function propulsionPerformance(
  parameters: MissionParameters,
): PropulsionPerformance {
  const exhaustVelocityMps =
    parameters.specificImpulseS * EARTH.standardGravityMps2;
  const nominalThrustN =
    (2 * parameters.efficiency * parameters.powerW) / exhaustVelocityMps;
  const nominalMassFlowKgps = nominalThrustN / exhaustVelocityMps;
  return {
    exhaustVelocityMps,
    nominalThrustN,
    nominalMassFlowKgps,
    initialThrustAccelerationMps2:
      nominalThrustN /
      (parameters.dryMassKg + parameters.propellantMassKg),
  };
}

export function initialCircularState(
  parameters: MissionParameters,
): DynamicState {
  const radiusM = parameters.centralBodyRadiusM + parameters.initialAltitudeM;
  return {
    xM: radiusM,
    yM: 0,
    vxMps: 0,
    vyMps: Math.sqrt(
      parameters.centralBodyGravitationalParameterM3S2 / radiusM,
    ),
    propellantKg: parameters.propellantMassKg,
  };
}

export function orbitalElements(
  state: DynamicState,
  body: Pick<
    MissionParameters,
    "centralBodyGravitationalParameterM3S2"
  > = {
    centralBodyGravitationalParameterM3S2:
      EARTH.gravitationalParameterM3S2,
  },
): OrbitalElements {
  const { xM, yM, vxMps, vyMps } = state;
  const radiusM = Math.hypot(xM, yM);
  const speedSquared = vxMps * vxMps + vyMps * vyMps;
  const speedMps = Math.sqrt(speedSquared);
  const radialVelocityDot = xM * vxMps + yM * vyMps;
  const mu = body.centralBodyGravitationalParameterM3S2;
  const specificEnergyJkg = speedSquared / 2 - mu / radiusM;
  const semimajorAxisM =
    Math.abs(specificEnergyJkg) < Number.EPSILON
      ? Number.POSITIVE_INFINITY
      : -mu / (2 * specificEnergyJkg);
  const common = speedSquared - mu / radiusM;
  const eccentricityXM =
    (common * xM - radialVelocityDot * vxMps) /
    mu;
  const eccentricityYM =
    (common * yM - radialVelocityDot * vyMps) /
    mu;

  return {
    radiusM,
    speedMps,
    semimajorAxisM,
    eccentricity: Math.hypot(eccentricityXM, eccentricityYM),
    specificEnergyJkg,
    specificAngularMomentumM2ps: xM * vyMps - yM * vxMps,
  };
}

export function meetsTargetCriteria(
  semimajorAxisM: number,
  eccentricity: number,
  targetSemimajorAxisM: number,
  settings: Pick<
    SolverSettings,
    "semimajorAxisToleranceM" | "eccentricityTolerance"
  > = DEFAULT_SOLVER_SETTINGS,
): boolean {
  return (
    Number.isFinite(semimajorAxisM) &&
    Number.isFinite(eccentricity) &&
    Math.abs(semimajorAxisM - targetSemimajorAxisM) <=
      settings.semimajorAxisToleranceM &&
    eccentricity <= settings.eccentricityTolerance
  );
}

type StateDerivative = readonly [number, number, number, number, number];

function derivative(
  state: DynamicState,
  thrustN: number,
  parameters: MissionParameters,
  performance: PropulsionPerformance,
): StateDerivative {
  const radiusM = Math.hypot(state.xM, state.yM);
  const radiusCubed = radiusM * radiusM * radiusM;
  const gravityScale =
    -parameters.centralBodyGravitationalParameterM3S2 / radiusCubed;
  const speedMps = Math.hypot(state.vxMps, state.vyMps);
  const totalMassKg =
    parameters.dryMassKg + Math.max(0, state.propellantKg);
  const thrustAccelerationMps2 = thrustN / totalMassKg;
  const hasDirection = speedMps > Number.EPSILON;
  const thrustAx = hasDirection
    ? thrustAccelerationMps2 * (state.vxMps / speedMps)
    : 0;
  const thrustAy = hasDirection
    ? thrustAccelerationMps2 * (state.vyMps / speedMps)
    : 0;

  return [
    state.vxMps,
    state.vyMps,
    gravityScale * state.xM + thrustAx,
    gravityScale * state.yM + thrustAy,
    thrustN > 0 ? -performance.nominalMassFlowKgps : 0,
  ];
}

function addScaled(
  state: DynamicState,
  delta: StateDerivative,
  scale: number,
): DynamicState {
  return {
    xM: state.xM + delta[0] * scale,
    yM: state.yM + delta[1] * scale,
    vxMps: state.vxMps + delta[2] * scale,
    vyMps: state.vyMps + delta[3] * scale,
    propellantKg: state.propellantKg + delta[4] * scale,
  };
}

/** One classical fourth-order Runge-Kutta step with constant thrust command. */
export function rk4Step(
  state: DynamicState,
  stepS: number,
  thrustN: number,
  parameters: MissionParameters,
  performance = propulsionPerformance(parameters),
): DynamicState {
  const k1 = derivative(state, thrustN, parameters, performance);
  const k2 = derivative(
    addScaled(state, k1, stepS / 2),
    thrustN,
    parameters,
    performance,
  );
  const k3 = derivative(
    addScaled(state, k2, stepS / 2),
    thrustN,
    parameters,
    performance,
  );
  const k4 = derivative(
    addScaled(state, k3, stepS),
    thrustN,
    parameters,
    performance,
  );
  const sixthStep = stepS / 6;

  return {
    xM: state.xM + sixthStep * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    yM: state.yM + sixthStep * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    vxMps:
      state.vxMps + sixthStep * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
    vyMps:
      state.vyMps + sixthStep * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]),
    propellantKg:
      state.propellantKg +
      sixthStep * (k1[4] + 2 * k2[4] + 2 * k3[4] + k4[4]),
  };
}

export function createOutputTimes(maxDurationS: number, outputStepS: number): number[] {
  const wholeSteps = Math.floor(maxDurationS / outputStepS);
  const times = new Array<number>(wholeSteps + 1);
  for (let index = 0; index <= wholeSteps; index += 1) {
    times[index] = index * outputStepS;
  }
  const last = times[times.length - 1];
  if (last < maxDurationS) {
    times.push(maxDurationS);
  } else {
    times[times.length - 1] = maxDurationS;
  }
  return times;
}

interface ControlState {
  thrustN: number;
  phase: PhaseCode;
}

function isInInterruption(
  timeS: number,
  parameters: MissionParameters,
  scenario: ScenarioKind,
): boolean {
  if (scenario !== "interrupted" || parameters.interruptionDurationS <= 0) {
    return false;
  }
  const endS =
    parameters.interruptionStartS + parameters.interruptionDurationS;
  return timeS >= parameters.interruptionStartS && timeS < endS;
}

function controlAt(
  timeS: number,
  state: DynamicState,
  scenario: ScenarioKind,
  targetCutoff: boolean,
  performance: PropulsionPerformance,
  parameters: MissionParameters,
): ControlState {
  if (targetCutoff) {
    return { thrustN: 0, phase: PHASE.TARGET_COAST };
  }
  if (state.propellantKg <= MASS_EPSILON_KG) {
    return { thrustN: 0, phase: PHASE.PROPELLANT_DEPLETED };
  }
  if (isInInterruption(timeS, parameters, scenario)) {
    return { thrustN: 0, phase: PHASE.INTERRUPTION };
  }
  if (performance.nominalThrustN > 0) {
    return { thrustN: performance.nominalThrustN, phase: PHASE.THRUSTING };
  }
  return { thrustN: 0, phase: PHASE.COASTING };
}

function createEmptySeries(): ScenarioSeries {
  return {
    xM: [],
    yM: [],
    vxMps: [],
    vyMps: [],
    altitudeM: [],
    speedMps: [],
    propellantKg: [],
    thrustN: [],
    semimajorAxisM: [],
    eccentricity: [],
    phase: [],
    validLength: 0,
  };
}

function appendSample(
  series: ScenarioSeries,
  state: DynamicState,
  control: ControlState,
  parameters: MissionParameters,
): void {
  const elements = orbitalElements(state, parameters);
  series.xM.push(state.xM);
  series.yM.push(state.yM);
  series.vxMps.push(state.vxMps);
  series.vyMps.push(state.vyMps);
  series.altitudeM.push(elements.radiusM - parameters.centralBodyRadiusM);
  series.speedMps.push(elements.speedMps);
  series.propellantKg.push(Math.max(0, state.propellantKg));
  series.thrustN.push(control.thrustN);
  series.semimajorAxisM.push(elements.semimajorAxisM);
  series.eccentricity.push(elements.eccentricity);
  series.phase.push(control.phase);
  series.validLength = series.xM.length;
}

function refineMonotonicEvent(
  state: DynamicState,
  maximumStepS: number,
  thrustN: number,
  parameters: MissionParameters,
  performance: PropulsionPerformance,
  eventTimeToleranceS: number,
  hasOccurred: (candidate: DynamicState) => boolean,
): { elapsedS: number; state: DynamicState } {
  let lowerS = 0;
  let upperS = maximumStepS;
  let upperState = rk4Step(
    state,
    maximumStepS,
    thrustN,
    parameters,
    performance,
  );

  for (
    let iteration = 0;
    iteration < 40 && upperS - lowerS > eventTimeToleranceS;
    iteration += 1
  ) {
    const midpointS = (lowerS + upperS) / 2;
    const midpointState = rk4Step(
      state,
      midpointS,
      thrustN,
      parameters,
      performance,
    );
    if (hasOccurred(midpointState)) {
      upperS = midpointS;
      upperState = midpointState;
    } else {
      lowerS = midpointS;
    }
  }

  return { elapsedS: upperS, state: upperState };
}

function snapToBoundary(
  timeS: number,
  parameters: MissionParameters,
  scenario: ScenarioKind,
): number {
  if (scenario !== "interrupted" || parameters.interruptionDurationS <= 0) {
    return timeS;
  }
  const startS = parameters.interruptionStartS;
  const endS = startS + parameters.interruptionDurationS;
  if (Math.abs(timeS - startS) <= TIME_EPSILON_S) return startS;
  if (Math.abs(timeS - endS) <= TIME_EPSILON_S) return endS;
  return timeS;
}

/**
 * Simulate one scenario on a caller-supplied output time axis. The interrupted
 * and reference scenarios therefore cannot accidentally drift onto different
 * chart or CSV timestamps.
 */
export function simulateScenario(
  parameters: MissionParameters,
  scenario: ScenarioKind,
  timeS: readonly number[],
  settingsOverrides: Partial<SolverSettings> = {},
  onProgress?: ProgressCallback,
): ScenarioResult {
  const settings = resolveSolverSettings(settingsOverrides);
  const issues = validateMissionParameters(parameters, settings);
  if (issues.length > 0) throw new SimulationInputError(issues);
  if (timeS.length === 0 || timeS[0] !== 0) {
    throw new SimulationInputError([
      { field: "simulation", message: "Output time axis must start at zero." },
    ]);
  }

  for (let index = 1; index < timeS.length; index += 1) {
    if (
      !Number.isFinite(timeS[index]) ||
      timeS[index] <= timeS[index - 1] ||
      timeS[index] > parameters.maxDurationS + TIME_EPSILON_S
    ) {
      throw new SimulationInputError([
        {
          field: "simulation",
          message: "Output time axis must be finite, increasing, and within mission duration.",
        },
      ]);
    }
  }

  const performance = propulsionPerformance(parameters);
  const targetSemimajorAxisM =
    parameters.centralBodyRadiusM + parameters.targetAltitudeM;
  const outageStartS = parameters.interruptionStartS;
  const outageEndS = outageStartS + parameters.interruptionDurationS;
  const events: SimulationEvent[] = [];
  const series = createEmptySeries();
  let state = initialCircularState(parameters);
  let currentTimeS = 0;
  let targetCutoff = false;
  let targetMetAtS: number | null = null;
  let burnCutoffAtS: number | null = null;
  let impactAtS: number | null = null;
  let interruptionStartRecorded = false;
  let interruptionEndRecorded = false;
  let propellantDepletionRecorded = false;
  let impacted = false;
  let lastProgress = -1;

  if (state.propellantKg <= MASS_EPSILON_KG) {
    state.propellantKg = 0;
    propellantDepletionRecorded = true;
    events.push({ type: "propellant-depleted", timeS: 0 });
  }

  const recordScheduledEvents = (): void => {
    if (scenario !== "interrupted" || parameters.interruptionDurationS <= 0) {
      return;
    }
    if (
      !interruptionStartRecorded &&
      outageStartS <= parameters.maxDurationS &&
      currentTimeS >= outageStartS - TIME_EPSILON_S
    ) {
      interruptionStartRecorded = true;
      events.push({ type: "interruption-start", timeS: outageStartS });
    }
    if (
      !interruptionEndRecorded &&
      outageEndS <= parameters.maxDurationS &&
      currentTimeS >= outageEndS - TIME_EPSILON_S
    ) {
      interruptionEndRecorded = true;
      events.push({ type: "interruption-end", timeS: outageEndS });
    }
  };

  const considerSuccess = (): void => {
    if (targetMetAtS !== null) return;
    const elements = orbitalElements(state, parameters);
    if (
      meetsTargetCriteria(
        elements.semimajorAxisM,
        elements.eccentricity,
        targetSemimajorAxisM,
        settings,
      ) &&
      (targetCutoff ||
        state.propellantKg <= MASS_EPSILON_KG ||
        performance.nominalThrustN === 0)
    ) {
      targetMetAtS = currentTimeS;
    }
  };

  for (let sampleIndex = 0; sampleIndex < timeS.length; sampleIndex += 1) {
    const sampleTimeS = timeS[sampleIndex];

    while (!impacted && currentTimeS < sampleTimeS - TIME_EPSILON_S) {
      currentTimeS = snapToBoundary(currentTimeS, parameters, scenario);
      recordScheduledEvents();
      considerSuccess();

      const control = controlAt(
        currentTimeS,
        state,
        scenario,
        targetCutoff,
        performance,
        parameters,
      );
      let stepS = Math.min(
        settings.internalStepS,
        sampleTimeS - currentTimeS,
        parameters.maxDurationS - currentTimeS,
      );

      if (scenario === "interrupted" && parameters.interruptionDurationS > 0) {
        if (
          outageStartS > currentTimeS + TIME_EPSILON_S &&
          outageStartS < currentTimeS + stepS - TIME_EPSILON_S
        ) {
          stepS = outageStartS - currentTimeS;
        }
        if (
          outageEndS > currentTimeS + TIME_EPSILON_S &&
          outageEndS < currentTimeS + stepS - TIME_EPSILON_S
        ) {
          stepS = outageEndS - currentTimeS;
        }
      }

      let reachesFuelDepletion = false;
      if (control.thrustN > 0 && performance.nominalMassFlowKgps > 0) {
        const fuelTimeS = state.propellantKg / performance.nominalMassFlowKgps;
        if (fuelTimeS <= stepS + TIME_EPSILON_S) {
          stepS = Math.max(0, fuelTimeS);
          reachesFuelDepletion = true;
        }
      }

      if (stepS <= TIME_EPSILON_S) {
        if (reachesFuelDepletion && !propellantDepletionRecorded) {
          state.propellantKg = 0;
          propellantDepletionRecorded = true;
          events.push({ type: "propellant-depleted", timeS: currentTimeS });
          continue;
        }
        currentTimeS = sampleTimeS;
        break;
      }

      const beforeElements = orbitalElements(state, parameters);
      const candidate = rk4Step(
        state,
        stepS,
        control.thrustN,
        parameters,
        performance,
      );

      if (
        beforeElements.radiusM > parameters.centralBodyRadiusM &&
        orbitalElements(candidate, parameters).radiusM <=
          parameters.centralBodyRadiusM
      ) {
        const impact = refineMonotonicEvent(
          state,
          stepS,
          control.thrustN,
          parameters,
          performance,
          settings.eventTimeToleranceS,
          (trial) =>
            orbitalElements(trial, parameters).radiusM <=
            parameters.centralBodyRadiusM,
        );
        state = impact.state;
        currentTimeS += impact.elapsedS;
        impacted = true;
        impactAtS = currentTimeS;
        events.push({ type: "body-impact", timeS: currentTimeS });
        break;
      }

      const candidateElements = orbitalElements(candidate, parameters);
      if (
        control.thrustN > 0 &&
        !targetCutoff &&
        beforeElements.semimajorAxisM < targetSemimajorAxisM &&
        candidateElements.semimajorAxisM >= targetSemimajorAxisM
      ) {
        const crossing = refineMonotonicEvent(
          state,
          stepS,
          control.thrustN,
          parameters,
          performance,
          settings.eventTimeToleranceS,
          (trial) =>
            orbitalElements(trial, parameters).semimajorAxisM >=
            targetSemimajorAxisM,
        );
        state = crossing.state;
        if (state.propellantKg < MASS_EPSILON_KG) state.propellantKg = 0;
        currentTimeS += crossing.elapsedS;
        targetCutoff = true;
        burnCutoffAtS = currentTimeS;
        events.push({ type: "target-thrust-cutoff", timeS: currentTimeS });
        considerSuccess();
        continue;
      }

      state = candidate;
      currentTimeS += stepS;
      currentTimeS = snapToBoundary(currentTimeS, parameters, scenario);

      if (reachesFuelDepletion) {
        state.propellantKg = 0;
        if (!propellantDepletionRecorded) {
          propellantDepletionRecorded = true;
          events.push({ type: "propellant-depleted", timeS: currentTimeS });
        }
      } else if (state.propellantKg < 0 && state.propellantKg > -MASS_EPSILON_KG) {
        state.propellantKg = 0;
      }
    }

    if (impacted) break;
    currentTimeS = sampleTimeS;
    currentTimeS = snapToBoundary(currentTimeS, parameters, scenario);
    recordScheduledEvents();
    considerSuccess();
    appendSample(
      series,
      state,
      controlAt(
        currentTimeS,
        state,
        scenario,
        targetCutoff,
        performance,
        parameters,
      ),
      parameters,
    );

    const progress =
      timeS.length <= 1 ? 1 : sampleIndex / Math.max(1, timeS.length - 1);
    if (onProgress && (progress - lastProgress >= 0.02 || progress === 1)) {
      lastProgress = progress;
      onProgress(progress);
    }
  }

  considerSuccess();
  const finalElements = orbitalElements(state, parameters);
  const finalPropellantKg = Math.max(0, state.propellantKg);
  const terminalReason: TerminalReason = impacted
    ? "body-impact"
    : targetMetAtS !== null
      ? "target-met"
      : propellantDepletionRecorded
        ? "propellant-depleted"
        : "duration-limit";

  return {
    series,
    summary: {
      scenario,
      targetMet: targetMetAtS !== null,
      targetMetAtS,
      burnCutoffAtS,
      impactAtS,
      finalSemimajorAxisM: finalElements.semimajorAxisM,
      finalEccentricity: finalElements.eccentricity,
      propellantUsedKg: parameters.propellantMassKg - finalPropellantKg,
      terminalReason,
      events,
    },
  };
}

export function simulateMissionComparison(
  parameters: MissionParameters,
  settingsOverrides: Partial<SolverSettings> = {},
  onProgress?: ProgressCallback,
): ComparisonResult {
  const settings = resolveSolverSettings(settingsOverrides);
  const issues = validateMissionParameters(parameters, settings);
  if (issues.length > 0) throw new SimulationInputError(issues);

  const timeS = createOutputTimes(
    parameters.maxDurationS,
    settings.outputStepS,
  );
  let lastReportedProgress = -1;
  const reportProgress = (progress: number): void => {
    if (!onProgress) return;
    const bounded = Math.max(0, Math.min(1, progress));
    if (bounded - lastReportedProgress >= 0.01 || bounded === 1) {
      lastReportedProgress = bounded;
      onProgress(bounded);
    }
  };

  reportProgress(0);
  const reference = simulateScenario(
    parameters,
    "reference",
    timeS,
    settings,
    (fraction) => reportProgress(fraction * 0.5),
  );
  const interrupted = simulateScenario(
    parameters,
    "interrupted",
    timeS,
    settings,
    (fraction) => reportProgress(0.5 + fraction * 0.5),
  );
  reportProgress(1);

  return {
    timeS,
    reference,
    interrupted,
    parameters: { ...parameters },
    settings,
    derived: propulsionPerformance(parameters),
  };
}
