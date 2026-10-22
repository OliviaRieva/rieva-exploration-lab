import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTACT_MODULES,
  CONTACT_FLIGHT_ASSUMPTIONS,
  DEFAULT_CONTACT_FLIGHT_CONFIGURATION,
  SCENARIO_SUGGESTIONS,
  configurationWithScenarioSuggestions,
  decodeContactFlightConfiguration,
  encodeContactFlightConfiguration,
  evaluateContactFlight,
  normalizeContactFlightConfiguration,
  standardAtmosphere,
} from "../lib/contact-flight/model.ts";
import {
  contactModuleDetails,
  encounterScenarios,
  researchItems,
} from "../lib/contact-flight/catalog.ts";

test("contact catalogs stay aligned with calculation and suggestion ids", () => {
  const moduleIds = CONTACT_MODULES.map((module) => module.id);
  assert.equal(new Set(moduleIds).size, moduleIds.length);
  assert.deepEqual(
    [...contactModuleDetails.map((module) => module.id)].sort(),
    [...moduleIds].sort(),
  );
  for (const equipmentModule of CONTACT_MODULES) {
    assert.equal(
      contactModuleDetails.find((detail) => detail.id === equipmentModule.id)?.name,
      equipmentModule.name,
      `${equipmentModule.id} keeps one public name across catalogs`,
    );
  }

  const moduleIdSet = new Set(moduleIds);
  for (const ids of Object.values(SCENARIO_SUGGESTIONS)) {
    assert.equal(new Set(ids).size, ids.length, "scenario suggestions are not duplicated");
    for (const id of ids) assert.ok(moduleIdSet.has(id), `suggested module ${id} exists`);
  }
  assert.deepEqual(
    [...encounterScenarios.map((scenario) => scenario.id)].sort(),
    [...Object.keys(SCENARIO_SUGGESTIONS)].sort(),
  );
  const researchIds = researchItems.map((item) => item.id);
  assert.equal(new Set(researchIds).size, researchIds.length);
});

test("standard atmosphere reproduces sea-level reference values", () => {
  const seaLevel = standardAtmosphere(0);
  assert.ok(Math.abs(seaLevel.temperatureK - 288.15) < 1e-10);
  assert.ok(Math.abs(seaLevel.pressurePa - 101_325) < 1e-8);
  assert.ok(Math.abs(seaLevel.densityKgM3 - 1.225) < 0.001);
  assert.ok(Math.abs(seaLevel.speedOfSoundMps - 340.294) < 0.01);
});

test("standard atmosphere handles non-finite input and is continuous at 11 km", () => {
  assert.deepEqual(standardAtmosphere(Number.NaN), standardAtmosphere(0));
  assert.deepEqual(standardAtmosphere(Number.POSITIVE_INFINITY), standardAtmosphere(0));
  const below = standardAtmosphere(11_000 - 1e-6);
  const above = standardAtmosphere(11_000 + 1e-6);
  assert.ok(Math.abs(below.temperatureK - above.temperatureK) < 1e-7);
  assert.ok(Math.abs(below.pressurePa - above.pressurePa) < 0.1);
});

test("dynamic pressure and Mach number use the selected atmosphere", () => {
  const config = {
    ...DEFAULT_CONTACT_FLIGHT_CONFIGURATION,
    altitudeM: 0,
    speedMps: 100,
  };
  const result = evaluateContactFlight(config);
  assert.ok(Math.abs(result.dynamicPressurePa - 0.5 * result.densityKgM3 * 10_000) < 1e-10);
  assert.ok(Math.abs(result.mach - 100 / result.speedOfSoundMps) < 1e-12);
});

test("module mass, power, and drag use explicit catalog assumptions", () => {
  const config = normalizeContactFlightConfiguration({
    ...DEFAULT_CONTACT_FLIGHT_CONFIGURATION,
    modules: Object.fromEntries(
      Object.keys(DEFAULT_CONTACT_FLIGHT_CONFIGURATION.modules).map((id) => [id, false]),
    ),
  });
  const base = evaluateContactFlight(config);
  assert.equal(base.moduleMassKg, 0);
  assert.equal(base.modulePowerKw, 0);
  assert.equal(base.totalMassKg, CONTACT_FLIGHT_ASSUMPTIONS.baseMassKg);

  const withSensor = evaluateContactFlight({
    ...config,
    modules: { ...config.modules, "spectral-sensor": true },
  });
  assert.equal(withSensor.moduleMassKg, 68);
  assert.equal(withSensor.modulePowerKw, 5.5);
  assert.ok(withSensor.dragCoefficient > base.dragCoefficient);
});

test("configuration persistence is normalized and round-trips", () => {
  const configured = normalizeContactFlightConfiguration({
    ...DEFAULT_CONTACT_FLIGHT_CONFIGURATION,
    altitudeM: 12_345,
    flightMode: "adaptive",
    modules: { ...DEFAULT_CONTACT_FLIGHT_CONFIGURATION.modules, "bio-isolation": true },
  });
  assert.deepEqual(
    decodeContactFlightConfiguration(encodeContactFlightConfiguration(configured)),
    configured,
  );
  assert.deepEqual(
    decodeContactFlightConfiguration("{broken"),
    DEFAULT_CONTACT_FLIGHT_CONFIGURATION,
  );
});

test("persistence rejects future schemas and non-boolean module flags", () => {
  const future = normalizeContactFlightConfiguration({
    ...DEFAULT_CONTACT_FLIGHT_CONFIGURATION,
    version: 2,
    flightMode: "low-boom",
  });
  assert.deepEqual(future, DEFAULT_CONTACT_FLIGHT_CONFIGURATION);

  const normalized = normalizeContactFlightConfiguration({
    ...DEFAULT_CONTACT_FLIGHT_CONFIGURATION,
    modules: {
      "spectral-sensor": "false",
      "bio-isolation": "true",
    },
  });
  assert.equal(normalized.modules["spectral-sensor"], true);
  assert.equal(normalized.modules["bio-isolation"], false);
  assert.equal(normalized.modules["redundant-controls"], true);
});

test("invalid and extreme values are constrained to the documented lab range", () => {
  const normalized = normalizeContactFlightConfiguration({
    altitudeM: 99_000,
    speedMps: -50,
    angleOfAttackDeg: Number.NaN,
    flightMode: "warp",
  });
  assert.equal(normalized.altitudeM, 20_000);
  assert.equal(normalized.speedMps, 45);
  assert.equal(normalized.angleOfAttackDeg, DEFAULT_CONTACT_FLIGHT_CONFIGURATION.angleOfAttackDeg);
  assert.equal(normalized.flightMode, DEFAULT_CONTACT_FLIGHT_CONFIGURATION.flightMode);
});

test("supersonic points expose the geometric Mach angle", () => {
  const result = evaluateContactFlight({
    ...DEFAULT_CONTACT_FLIGHT_CONFIGURATION,
    altitudeM: 12_000,
    speedMps: 500,
  });
  assert.ok(result.mach > 1);
  assert.ok(result.shockMachAngleDeg !== null);
  assert.ok(Math.abs(result.shockMachAngleDeg! - Math.asin(1 / result.mach) * 180 / Math.PI) < 1e-12);
});

test("scenario suggestions are transparent fixed rules", () => {
  const configured = configurationWithScenarioSuggestions({
    ...DEFAULT_CONTACT_FLIGHT_CONFIGURATION,
    scenario: "radiation-event",
  });
  assert.equal(configured.modules["radiation-liner"], true);
  assert.equal(configured.modules["em-hardening"], true);
  assert.equal(configured.modules["bio-isolation"], false);
});

test("unknown biology and fictional physics retain explicit limitations", () => {
  const result = evaluateContactFlight({
    ...DEFAULT_CONTACT_FLIGHT_CONFIGURATION,
    modules: {
      ...DEFAULT_CONTACT_FLIGHT_CONFIGURATION.modules,
      "bio-isolation": true,
      "anomaly-detector": true,
    },
  });
  assert.match(result.messages.join(" "), /not an antibiotic shield/i);
  assert.match(result.messages.join(" "), /explicitly fictional/i);
});
