# Rievastra — Exploration Systems Laboratory

Rievastra combines two persistent browser laboratories. **Orbital Flight** is an electric-propulsion mission study that propagates an uninterrupted reference and an otherwise identical mission with one engine interruption. **Surface Studio — Missionwear** is an independent research-informed aerospace design exhibition with a procedural 3D suit configurator, materials inspector, and transparent mission rules. Switching laboratories preserves each section’s React state.

The working name combines **Rieva** and *astra*. All public brand text is centralized in [`lib/site-config.ts`](lib/site-config.ts), so the site can be renamed in one edit.

## Run locally

Prerequisite: Node.js 22.13 or newer and Python 3.9 or newer for the independent validation script.

```bash
npm install
npm run dev
```

Open the local address printed by the development server (normally `http://localhost:3000`). No account, database, API key, or paid service is required.

Useful commands:

```bash
npm run test:physics      # nine orbital checks + seven Surface Studio checks
npm run validate:python   # independent standard-library Python validation
npm run build             # production Cloudflare-compatible build
npm test                  # physics tests + build + rendered-page checks
npm run lint
```

## What the application includes

- Editable orbit, spacecraft, propulsion, interruption, and mission-duration inputs.
- Three mission presets plus baseline, applied-technology, and research-envelope scenarios.
- A Web Worker that propagates the reference and interrupted cases without tying up the interface.
- Separate Run, Play, Pause, timeline Reset, scrubber, jump-to-outage, and playback-speed controls.
- An interactive projected-3D Earth/orbit scene with mouse, touch, wheel, and keyboard camera controls.
- Live altitude, speed, propellant, thrust, semimajor axis, eccentricity, and target-gate status.
- Altitude, propellant, and thrust charts on one common time axis with interruption shading.
- A result narrative generated from the current numerical output, not canned copy.
- Actual CSV export at the stored 60 s output cadence.
- Explanations, assumptions, primary references, and measured validation results.
- Responsive layouts, labelled controls, visible focus states, reduced-motion support, and textual chart/scene descriptions.

### Surface Studio — Missionwear

- Three original concepts: lunar **SELENE**, Mars **AREO**, and Earth-training **VECTOR**.
- A real Three.js model built from named procedural meshes—helmet, visors, neck ring, torso layers, joints, gloves, boots, backpack, staff, cat-ear pods, dust module, haptics, and assistive structures.
- Mouse/touch orbit controls, wheel zoom, camera presets, clickable parts, exploded assembly, layered cutaway, detachable helmet in assembly mode, body-proportion presets, and an explicitly illustrative walk cycle.
- Pearl/silver, white/champagne, and obsidian/gold palettes with visible thermal and optical caveats.
- Editable outer tailoring and mission accessories without implying that pockets or pants replace pressure architecture.
- Local save/load, validated JSON export, and canvas PNG export. No account or backend is involved.
- Moon, Mars, Earth-training, and hypothetical higher-gravity rules using stated mass, gravity, and accessory-power assumptions.
- Compatibility language limited to required items, conceptual combinations, and named unresolved conflicts—never a safety or certification score.
- An editable equipment/materials/reference catalog with operational-heritage, demonstrated-research, and original-concept labels.

The suit model is an educational integration concept, not qualified hardware. Habitat clothing, launch/entry garments, and surface EVA equipment are explicitly distinguished. A cooling or compression garment alone is not vacuum protection.

## Physics model

The state is planar and Earth-centered. SI units are used internally.

```text
r̈ = −μr / |r|³ + (T/m) ûv
ve = Isp g0
T = 2ηP / ve
ṁ = −T / ve
```

Constants:

- Earth gravitational parameter `μ = 3.986004418 × 10¹⁴ m³/s²`.
- Spherical volumetric mean Earth radius `R = 6,371,000 m`.
- Exact standard gravity `g0 = 9.80665 m/s²`.

The spacecraft starts in an exact circular orbit at the selected altitude. When powered, thrust points along the instantaneous velocity vector. During the interruption, both thrust and propellant flow are exactly zero. Thrust also stops when propellant is exhausted or when the target semimajor axis is reached. This is a simple guidance rule—not an optimizer.

### Numerical method

- Classical fixed-step fourth-order Runge–Kutta (RK4).
- Default internal step: 20 s.
- Stored output cadence: 60 s.
- Steps are split at output times, interruption start/end, propellant exhaustion, target cutoff, and mission end so a discontinuity is never averaged across one step.
- Target and impact crossings are refined in time.
- Both cases use the same output array from zero to the selected mission limit.

### Honest success criterion

A target orbit is reported only when both project-defined conditions hold:

```text
|a − atarget| ≤ 10 km
eccentricity ≤ 0.005
```

Crossing the target altitude alone is not called circular-orbit insertion. A mission may therefore cross the requested altitude and still correctly report that the target gate was not met.

### Scope and limitations

This is an educational first-order mission study, not a flight design or hardware qualification tool. It assumes constant propulsion efficiency and excludes atmospheric drag, Earth oblateness/J₂, third bodies, eclipses, radiation, thermal limits, solar-array degradation, power-processing losses beyond the single efficiency term, throttle maps, attitude dynamics, finite steering response, navigation uncertainty, plume interactions, and hardware lifetime constraints.

The technology presets only change parameters represented by this model. The research envelope is explicitly hypothetical. Iodine and atmosphere-breathing propulsion are discussed as model boundaries; the site does not pretend its simple dynamics can evaluate their materials, plasma, intake, or drag physics.

## Validation

`scripts/validate.py` is independent of the TypeScript implementation and uses only the Python standard library. On 29 September 2026 it measured:

| Check | Measured | Acceptance |
|---|---:|---:|
| 24 h unpowered circular-orbit radial drift | 0.006912 m | < 1 m |
| Maximum relative specific-energy error | 5.081 × 10⁻¹⁰ | < 1 × 10⁻⁹ |
| Maximum relative angular-momentum error | 2.541 × 10⁻¹⁰ | < 1 × 10⁻⁹ |
| Analytical propellant-use error | 4.06 × 10⁻¹² kg | < 1 × 10⁻⁹ kg |
| 40 → 20 → 10 s position-error reduction | 23.41× (order 4.55) | > 8× |
| Interruption thrust leakage | exactly 0 N | exactly 0 N |
| Propellant change during interruption | exactly 0 kg | ≤ 1 × 10⁻¹² kg |

The TypeScript suite adds common-axis identity, zero-duration interruption equivalence, target-gate semantics, target cutoff, and fuel-exhaustion checks. Never replace these checks with stored decorative curves; rerun them after changing the solver.

## Project structure

```text
app/
  components/
    RievastraApp.tsx      state-preserving laboratory navigation
    SimulatorApp.tsx       complete mission console and playback state
    OrbitScene.tsx         interactive projected-3D Canvas scene
    MissionCharts.tsx      accessible computed SVG charts
    KnowledgeSections.tsx  technology, physics, validation, references
    SurfaceStudio.tsx      collection, controls, inspector, rules, research
    SurfaceSuitScene.tsx   named procedural Three.js suit meshes
  workers/
    mission.worker.ts      worker protocol and simulation execution
lib/
  simulation/index.ts      framework-independent physics and RK4 solver
  surface-studio/catalog.ts structured equipment, materials, palettes, sources
  surface-studio/rules.ts  persistence validation, mass/weight, mission rules
  site-config.ts           single-source brand configuration
scripts/
  validate.py              independent Python validation
tests/
  simulation.test.ts       numerical and event checks
  surface-studio.test.ts   persistence, requirements, mass and power checks
  rendered-html.test.mjs   production-render checks
```

## Primary references

- MIT OpenCourseWare 16.346, [Basic Two-Body Relations](https://ocw.mit.edu/courses/16-346-astrodynamics-fall-2008/dbce406df8d13e052f9229880ed96c02_lec_02.pdf).
- NASA/JPL, [Fundamentals of Electric Propulsion: Ion and Hall Thrusters](https://descanso.jpl.nasa.gov/SciTechBook/series4/Electric_Propulsion_2nd_edition.pdf), second edition.
- NASA EGM96, [Earth gravitational constant](https://cddis.nasa.gov/926/egm96/doc/S11.HTML).
- NASA NSSDC, [Earth Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html).
- NIST, [standard acceleration of gravity](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8).
- NASA, [HERMeS / AEPS performance overview](https://ntrs.nasa.gov/api/citations/20220007037/downloads/SP2022_438_CASSADY.pdf).
- Rafalskyi et al., [In-orbit demonstration of an iodine electric propulsion system](https://www.nature.com/articles/s41586-021-04015-y), *Nature* (2021).

## Deployment

The production build uses the included vinext/Vite and Cloudflare Worker-compatible output. `.openai/hosting.json` contains only the Sites project metadata; the application needs no database or runtime secrets.
