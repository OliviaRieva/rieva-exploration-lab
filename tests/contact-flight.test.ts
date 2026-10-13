import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTACT_FLIGHT_ASSUMPTIONS,
  DEFAULT_CONTACT_FLIGHT_CONFIGURATION,
  configurationWithScenarioSuggestions,
  decodeContactFlightConfiguration,
  encodeContactFlightConfiguration,
  evaluateContactFlight,
  normalizeContactFlightConfiguration,
  standardAtmosphere,
} from "../lib/contact-flight/model.ts";

test("standard atmosphere reproduces sea-level reference values", () => {
  const seaLevel = standardAtmosphere(0);
  assert.ok(Math.abs(seaLevel.temperatureK - 288.15) < 1e-10);
  assert.ok(Math.abs(seaLevel.pressurePa - 101_325) < 1e-8);
  assert.ok(Math.abs(seaLevel.densityKgM3 - 1.225) < 0.001);
  assert.ok(Math.abs(seaLevel.speedOfSoundMps - 340.294) < 0.01);
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
