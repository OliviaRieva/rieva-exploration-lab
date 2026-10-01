import assert from "node:assert/strict";
import test from "node:test";

// Node's built-in TypeScript stripping requires the explicit extension. The
// production worker uses the extensionless bundler form.
import {
  DEFAULT_MISSION_PARAMETERS,
  DEFAULT_SOLVER_SETTINGS,
  EARTH,
  PHASE,
  createOutputTimes,
  meetsTargetCriteria,
  orbitalElements,
  propulsionPerformance,
  simulateMissionComparison,
  simulateScenario,
  validateMissionParameters,
  type MissionParameters,
} from "../lib/simulation/index.ts";
import { centralBodies } from "../lib/orbital/catalog.ts";

function mission(
  overrides: Partial<MissionParameters> = {},
): MissionParameters {
  return { ...DEFAULT_MISSION_PARAMETERS, ...overrides };
}

function relativeError(actual: number, expected: number): number {
  return Math.abs((actual - expected) / expected);
}

test("all catalog body defaults fit the published altitude controls", () => {
  for (const body of centralBodies) {
    assert.ok(body.initialAltitudeKm >= 1 && body.initialAltitudeKm <= 100_000);
    assert.ok(body.targetAltitudeKm >= 130 && body.targetAltitudeKm <= 100_000);
    assert.ok(body.targetAltitudeKm > body.initialAltitudeKm);
  }
});

test("an unpowered circular orbit remains circular and conserves invariants", () => {
  const parameters = mission({
    initialAltitudeM: 400_000,
    targetAltitudeM: 500_000,
    powerW: 0,
    interruptionStartS: 0,
    interruptionDurationS: 0,
    maxDurationS: 86_400,
  });
  const times = createOutputTimes(parameters.maxDurationS, 20);
  const result = simulateScenario(parameters, "reference", times, {
    internalStepS: 20,
    outputStepS: 20,
  });
  const initialState = {
    xM: result.series.xM[0],
    yM: result.series.yM[0],
    vxMps: result.series.vxMps[0],
    vyMps: result.series.vyMps[0],
    propellantKg: result.series.propellantKg[0],
  };
  const initialElements = orbitalElements(initialState);
  let maximumRadiusErrorM = 0;
  let maximumEnergyRelativeError = 0;
  let maximumAngularMomentumRelativeError = 0;

  for (let index = 0; index < result.series.validLength; index += 1) {
    const elements = orbitalElements({
      xM: result.series.xM[index],
      yM: result.series.yM[index],
      vxMps: result.series.vxMps[index],
      vyMps: result.series.vyMps[index],
      propellantKg: result.series.propellantKg[index],
    });
    maximumRadiusErrorM = Math.max(
      maximumRadiusErrorM,
      Math.abs(elements.radiusM - initialElements.radiusM),
    );
    maximumEnergyRelativeError = Math.max(
      maximumEnergyRelativeError,
      relativeError(
        elements.specificEnergyJkg,
        initialElements.specificEnergyJkg,
      ),
    );
    maximumAngularMomentumRelativeError = Math.max(
      maximumAngularMomentumRelativeError,
      relativeError(
        elements.specificAngularMomentumM2ps,
        initialElements.specificAngularMomentumM2ps,
      ),
    );
  }

  assert.ok(
    maximumRadiusErrorM < 1,
    `maximum radius error was ${maximumRadiusErrorM} m`,
  );
  assert.ok(
    maximumEnergyRelativeError < 1e-7,
    `maximum relative energy error was ${maximumEnergyRelativeError}`,
  );
  assert.ok(
    maximumAngularMomentumRelativeError < 5e-8,
    `maximum relative angular momentum error was ${maximumAngularMomentumRelativeError}`,
  );
});

test("central-body parameters change circular speed without changing the equations", () => {
  const lunar = mission({
    centralBodyRadiusM: 1_737_400,
    centralBodyGravitationalParameterM3S2: 4.902_800_118e12,
    initialAltitudeM: 100_000,
    targetAltitudeM: 500_000,
    powerW: 0,
    interruptionDurationS: 0,
    maxDurationS: 7_200,
  });
  const initial = simulateScenario(lunar, "reference", [0, 7_200], {
    internalStepS: 10,
    outputStepS: 7_200,
  });
  const expectedSpeed = Math.sqrt(
    lunar.centralBodyGravitationalParameterM3S2 /
      (lunar.centralBodyRadiusM + lunar.initialAltitudeM),
  );

  assert.ok(Math.abs(initial.series.speedMps[0] - expectedSpeed) < 1e-9);
  assert.ok(Math.abs(initial.series.altitudeM[0] - 100_000) < 1e-9);
  assert.ok(
    Math.abs(initial.series.altitudeM.at(-1)! - 100_000) < 1,
    "the unpowered lunar orbit should remain circular over the short check",
  );
});

test("invalid central-body constants are rejected before propagation", () => {
  const invalid = mission({
    centralBodyRadiusM: Number.NaN,
    centralBodyGravitationalParameterM3S2: 0,
  });
  const issues = validateMissionParameters(invalid);
  assert.ok(issues.some((issue) => issue.field === "centralBodyRadiusM"));
  assert.ok(
    issues.some(
      (issue) =>
        issue.field === "centralBodyGravitationalParameterM3S2",
    ),
  );
});

test("constant-thrust propellant use matches the analytical mass-flow prediction", () => {
  const parameters = mission({
    targetAltitudeM: 20_000_000,
    powerW: 10_000,
    efficiency: 0.6,
    specificImpulseS: 2_000,
    propellantMassKg: 100,
    interruptionStartS: 0,
    interruptionDurationS: 0,
    maxDurationS: 12 * 3_600,
  });
  const performance = propulsionPerformance(parameters);
  const result = simulateMissionComparison(parameters, {
    internalStepS: 20,
    outputStepS: 600,
  });
  const expectedUseKg =
    performance.nominalMassFlowKgps * parameters.maxDurationS;
  const actualUseKg = result.reference.summary.propellantUsedKg;

  assert.ok(Math.abs(performance.nominalThrustN - 0.6118297277867569) < 1e-12);
  assert.ok(
    Math.abs(actualUseKg - expectedUseKg) < 1e-8,
    `mass error was ${Math.abs(actualUseKg - expectedUseKg)} kg`,
  );
});

test("the powered solution converges as the RK4 step is tightened", () => {
  const parameters = mission({
    targetAltitudeM: 20_000_000,
    interruptionStartS: 0,
    interruptionDurationS: 0,
    maxDurationS: 86_400,
  });
  const finalSemimajorAxis = (internalStepS: number): number => {
    const times = [0, parameters.maxDurationS];
    return simulateScenario(parameters, "reference", times, {
      internalStepS,
      outputStepS: parameters.maxDurationS,
    }).summary.finalSemimajorAxisM;
  };
  const at40 = finalSemimajorAxis(40);
  const at20 = finalSemimajorAxis(20);
  const at10 = finalSemimajorAxis(10);
  const at5 = finalSemimajorAxis(5);
  const coarseDifference = Math.abs(at40 - at20);
  const mediumDifference = Math.abs(at20 - at10);
  const fineDifference = Math.abs(at10 - at5);

  assert.ok(
    mediumDifference < coarseDifference / 8,
    `40→20 s difference ${coarseDifference} m; 20→10 s difference ${mediumDifference} m`,
  );
  assert.ok(
    fineDifference < mediumDifference / 8,
    `20→10 s difference ${mediumDifference} m; 10→5 s difference ${fineDifference} m`,
  );
  assert.ok(fineDifference < 0.01, `fine difference was ${fineDifference} m`);
});

test("the interruption switches thrust off and freezes propellant on exact boundaries", () => {
  const interruptionStartS = 2 * 3_600;
  const interruptionDurationS = 3_600;
  const interruptionEndS = interruptionStartS + interruptionDurationS;
  const parameters = mission({
    targetAltitudeM: 20_000_000,
    interruptionStartS,
    interruptionDurationS,
    maxDurationS: 6 * 3_600,
  });
  const result = simulateMissionComparison(parameters, {
    internalStepS: 20,
    outputStepS: 60,
  });
  const startIndex = result.timeS.indexOf(interruptionStartS);
  const endIndex = result.timeS.indexOf(interruptionEndS);
  assert.ok(startIndex >= 0 && endIndex > startIndex);

  for (let index = startIndex; index < endIndex; index += 1) {
    assert.equal(result.interrupted.series.thrustN[index], 0);
    assert.equal(result.interrupted.series.phase[index], PHASE.INTERRUPTION);
  }
  assert.equal(
    result.interrupted.series.propellantKg[startIndex],
    result.interrupted.series.propellantKg[endIndex],
  );
  assert.equal(
    result.interrupted.series.thrustN[endIndex],
    result.derived.nominalThrustN,
  );

  const finalIndex = result.timeS.length - 1;
  const savedPropellantKg =
    result.interrupted.series.propellantKg[finalIndex] -
    result.reference.series.propellantKg[finalIndex];
  const expectedSavedKg =
    result.derived.nominalMassFlowKgps * interruptionDurationS;
  assert.ok(Math.abs(savedPropellantKg - expectedSavedKg) < 1e-8);
  assert.deepEqual(
    result.interrupted.summary.events
      .filter((event) => event.type.startsWith("interruption"))
      .map((event) => [event.type, event.timeS]),
    [
      ["interruption-start", interruptionStartS],
      ["interruption-end", interruptionEndS],
    ],
  );
});

test("reference and interrupted missions use one identical output time axis", () => {
  const parameters = mission({
    maxDurationS: 12_345,
    interruptionStartS: 2_345,
    interruptionDurationS: 1_111,
    targetAltitudeM: 20_000_000,
  });
  const result = simulateMissionComparison(parameters, {
    internalStepS: 17,
    outputStepS: 137,
  });

  assert.equal(result.timeS[0], 0);
  assert.equal(result.timeS.at(-1), parameters.maxDurationS);
  assert.equal(result.reference.series.validLength, result.timeS.length);
  assert.equal(result.interrupted.series.validLength, result.timeS.length);
  assert.equal(result.reference.series.altitudeM.length, result.timeS.length);
  assert.equal(result.interrupted.series.altitudeM.length, result.timeS.length);
});

test("zero-duration interruption is numerically identical to the reference", () => {
  const parameters = mission({
    maxDurationS: 7_200,
    interruptionStartS: 1_234,
    interruptionDurationS: 0,
    targetAltitudeM: 20_000_000,
  });
  const result = simulateMissionComparison(parameters, {
    internalStepS: 20,
    outputStepS: 120,
  });

  assert.deepEqual(result.interrupted.series, result.reference.series);
  assert.equal(
    result.interrupted.summary.propellantUsedKg,
    result.reference.summary.propellantUsedKg,
  );
});

test("success requires both semimajor-axis and eccentricity tolerances", () => {
  const targetSemimajorAxisM = EARTH.meanRadiusM + 2_000_000;

  assert.equal(
    meetsTargetCriteria(targetSemimajorAxisM, 0.004, targetSemimajorAxisM),
    true,
  );
  assert.equal(
    meetsTargetCriteria(targetSemimajorAxisM, 0.1, targetSemimajorAxisM),
    false,
    "crossing the target radius on an eccentric orbit is not success",
  );
  assert.equal(
    meetsTargetCriteria(
      targetSemimajorAxisM +
        DEFAULT_SOLVER_SETTINGS.semimajorAxisToleranceM +
        1,
      0,
      targetSemimajorAxisM,
    ),
    false,
  );
});

test("prograde guidance cuts off at a genuinely near-circular target orbit", () => {
  const parameters = mission({
    targetAltitudeM: 600_000,
    interruptionStartS: 0,
    interruptionDurationS: 0,
    maxDurationS: 86_400,
  });
  const result = simulateScenario(
    parameters,
    "reference",
    [0, parameters.maxDurationS],
    { internalStepS: 20, outputStepS: parameters.maxDurationS },
  );
  const targetSemimajorAxisM = EARTH.meanRadiusM + parameters.targetAltitudeM;

  assert.equal(result.summary.targetMet, true);
  assert.ok(result.summary.burnCutoffAtS !== null);
  assert.ok(
    Math.abs(result.summary.finalSemimajorAxisM - targetSemimajorAxisM) <=
      DEFAULT_SOLVER_SETTINGS.semimajorAxisToleranceM,
  );
  assert.ok(
    result.summary.finalEccentricity <=
      DEFAULT_SOLVER_SETTINGS.eccentricityTolerance,
  );
});

test("fuel exhaustion is event-aligned, never negative, and permanently disables thrust", () => {
  const parameters = mission({
    targetAltitudeM: 20_000_000,
    dryMassKg: 500,
    propellantMassKg: 0.001,
    powerW: 10_000,
    efficiency: 0.6,
    specificImpulseS: 1_000,
    interruptionStartS: 0,
    interruptionDurationS: 0,
    maxDurationS: 60,
  });
  const performance = propulsionPerformance(parameters);
  const expectedDepletionTimeS =
    parameters.propellantMassKg / performance.nominalMassFlowKgps;
  const result = simulateMissionComparison(parameters, {
    internalStepS: 5,
    outputStepS: 1,
    eventTimeToleranceS: 1e-4,
  });
  const depletionEvent = result.reference.summary.events.find(
    (event) => event.type === "propellant-depleted",
  );

  assert.ok(depletionEvent);
  assert.ok(Math.abs(depletionEvent.timeS - expectedDepletionTimeS) < 1e-8);
  assert.ok(result.reference.series.propellantKg.every((mass) => mass >= 0));
  const firstSampleAfterDepletion = result.timeS.findIndex(
    (time) => time > expectedDepletionTimeS,
  );
  for (
    let index = firstSampleAfterDepletion;
    index < result.timeS.length;
    index += 1
  ) {
    assert.equal(result.reference.series.thrustN[index], 0);
    assert.equal(result.reference.series.phase[index], PHASE.PROPELLANT_DEPLETED);
  }
  assert.equal(result.reference.series.propellantKg.at(-1), 0);
});
