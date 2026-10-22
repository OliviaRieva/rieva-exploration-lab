import assert from "node:assert/strict";
import test from "node:test";
import {
  approximateTidalDifferentialMps2,
  assessOrbit,
  equatorialCircularPeriodSeconds,
  ergosphereRadiusRg,
  gravitationalRadiusKm,
  kerrRadii,
} from "../lib/black-hole/model.ts";
import {
  blackHolePresets,
  blackHoleReferences,
  defaultBlackHoleConfiguration,
  verificationDate,
} from "../lib/black-hole/catalog.ts";

function approximately(actual: number, expected: number, tolerance: number) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("black-hole presets reference unique, existing catalog sources", () => {
  const presetIds = blackHolePresets.map((preset) => preset.id);
  const sourceIds = blackHoleReferences.map((reference) => reference.id);
  assert.equal(new Set(presetIds).size, presetIds.length);
  assert.equal(new Set(sourceIds).size, sourceIds.length);
  const sourceIdSet = new Set(sourceIds);
  for (const preset of blackHolePresets) {
    for (const sourceId of preset.sourceIds) {
      assert.ok(sourceIdSet.has(sourceId), `${preset.id} references ${sourceId}`);
    }
  }
  assert.ok(presetIds.includes(defaultBlackHoleConfiguration.presetId));
  assert.match(verificationDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("Schwarzschild limit has horizon 2 rg, photon orbit 3 rg, and ISCO 6 rg", () => {
  const radii = kerrRadii(0);
  approximately(radii.horizonRg, 2, 1e-12);
  approximately(radii.progradePhotonRg, 3, 1e-12);
  approximately(radii.retrogradePhotonRg, 3, 1e-12);
  approximately(radii.progradeIscoRg, 6, 1e-12);
  approximately(radii.retrogradeIscoRg, 6, 1e-12);
});

test("rapid spin moves prograde ISCO inward and retrograde ISCO outward", () => {
  const radii = kerrRadii(0.9);
  approximately(radii.progradeIscoRg, 2.320883, 1e-5);
  approximately(radii.retrogradeIscoRg, 8.717352, 1e-5);
  assert.ok(radii.progradePhotonRg < radii.progradeIscoRg);
  assert.ok(radii.retrogradePhotonRg < radii.retrogradeIscoRg);
});

test("Kerr outer static limit meets the horizon at the pole and remains 2 rg at the equator", () => {
  const spin = 0.82;
  const radii = kerrRadii(spin);
  approximately(ergosphereRadiusRg(spin, 0), radii.horizonRg, 1e-12);
  approximately(ergosphereRadiusRg(spin, Math.PI / 2), 2, 1e-12);
});

test("one solar mass gravitational radius is approximately 1.4767 km", () => {
  approximately(gravitationalRadiusKm(1), 1.47667, 2e-5);
});

test("public scale helpers reject non-finite inputs without leaking NaN", () => {
  assert.equal(gravitationalRadiusKm(Number.NaN), 0);
  assert.equal(
    approximateTidalDifferentialMps2(Number.POSITIVE_INFINITY, 6, 12),
    0,
  );
  assert.equal(
    equatorialCircularPeriodSeconds(10, 0.1, 0.999, "retrograde"),
    null,
    "a non-positive Kerr period denominator is outside this helper's domain",
  );
  const assessment = assessOrbit({
    massSolar: Number.NaN,
    spin: Number.NaN,
    radiusRg: Number.NaN,
    direction: "sideways" as never,
    probeKind: "dragon" as never,
  });
  assert.equal(assessment.regime, "captured");
  assert.ok(Number.isFinite(assessment.selectedIscoRg));
  assert.ok(Number.isFinite(assessment.selectedPhotonRg));

  const extremeButFinite = assessOrbit({
    massSolar: 1e300,
    spin: 0.5,
    radiusRg: 7,
    direction: "prograde",
    probeKind: "spacecraft",
  });
  assert.ok(Number.isFinite(gravitationalRadiusKm(1e300)));
  assert.ok(Number.isFinite(extremeButFinite.tidalDifferentialMps2!));
  assert.ok(Number.isFinite(extremeButFinite.orbitalPeriodSeconds!));
});

test("orbit assessment distinguishes capture, unstable, and permitted circular regions", () => {
  const common = {
    massSolar: 10,
    spin: 0,
    direction: "prograde" as const,
    probeKind: "spacecraft" as const,
  };
  assert.equal(assessOrbit({ ...common, radiusRg: 1.9 }).regime, "captured");
  assert.equal(assessOrbit({ ...common, radiusRg: 2.7 }).regime, "no-timelike-circle");
  assert.equal(assessOrbit({ ...common, radiusRg: 4.5 }).regime, "unstable");
  assert.equal(assessOrbit({ ...common, radiusRg: 7 }).regime, "stable-circular-allowed");
});

test("a photon is labeled circular only at the calculated critical radius", () => {
  const radii = kerrRadii(0.6);
  const critical = assessOrbit({
    massSolar: 4.297e6,
    spin: 0.6,
    radiusRg: radii.progradePhotonRg,
    direction: "prograde",
    probeKind: "photon",
  });
  assert.equal(critical.regime, "critical-photon-orbit");

  const nearButNotExact = assessOrbit({
    massSolar: 4.297e6,
    spin: 0.6,
    radiusRg: radii.progradePhotonRg * 1.01,
    direction: "prograde",
    probeKind: "photon",
  });
  assert.equal(nearButNotExact.regime, "photon-flyby");
  assert.match(nearButNotExact.title, /Near the critical photon radius/);

  const outside = assessOrbit({
    massSolar: 4.297e6,
    spin: 0.6,
    radiusRg: radii.progradePhotonRg * 1.2,
    direction: "prograde",
    probeKind: "photon",
  });
  assert.equal(outside.regime, "photon-flyby");
});

test("the ISCO is identified as marginal rather than fully stable", () => {
  const radii = kerrRadii(0.7);
  const assessment = assessOrbit({
    massSolar: 10,
    spin: 0.7,
    radiusRg: radii.progradeIscoRg,
    direction: "prograde",
    probeKind: "spacecraft",
  });
  assert.equal(assessment.regime, "marginal-isco");
  assert.match(assessment.title, /Marginal circular orbit/);
});

test("the local tidal estimate is withheld when object size is not small versus radius", () => {
  const assessment = assessOrbit({
    massSolar: 10,
    spin: 0.7,
    radiusRg: 7,
    direction: "prograde",
    probeKind: "star",
  });
  assert.equal(assessment.tidalDifferentialMps2, null);
  assert.match(assessment.tidalNote, /too large compared with this coordinate radius/i);
});

test("at fixed radius in rg, the approximate tidal gradient scales as inverse mass squared", () => {
  const tenSolar = approximateTidalDifferentialMps2(10, 6, 12);
  const twentySolar = approximateTidalDifferentialMps2(20, 6, 12);
  approximately(tenSolar / twentySolar, 4, 1e-12);
});

test("preset-sized supermassive hole has far gentler horizon-scale gradient than a stellar hole", () => {
  const stellar = approximateTidalDifferentialMps2(10, 2, 2);
  const sgrA = approximateTidalDifferentialMps2(4.297e6, 2, 2);
  assert.ok(stellar / sgrA > 1e10);
});
