# RIEVA — Exploration Systems Laboratory

RIEVA combines four persistent browser laboratories behind an animated home portal. **Orbital Flight** is an electric-propulsion mission study that propagates an uninterrupted reference and an otherwise identical mission with one engine interruption. **Black Hole Laboratory** explores calculated Kerr boundaries and transparent orbit diagnostics around rotating black holes. **Surface Studio — Missionwear** is an independent research-informed aerospace design exhibition with a Blender-authored 3D suit configurator, materials inspector, environmental test room, and transparent mission rules. **Contact Flight** combines an original Blender aircraft, an interactive aerodynamic point model, a turbine-engine explainer, transparent first-contact resilience modules, and a dated evidence map for astrobiology, SETI, aerodynamics, and propulsion. Switching laboratories preserves each laboratory’s React state.

The **RIEVA** identity is centralized in [`lib/site-config.ts`](lib/site-config.ts), so public naming stays consistent across all four laboratories.

## Run locally

Prerequisite: Node.js 22.13 or newer and Python 3.9 or newer for the independent validation script.

```bash
npm install
npm run dev
```

Open the local address printed by the development server (normally `http://localhost:3000`). No account, database, API key, or paid service is required.

Useful commands:

```bash
npm run test:physics      # orbital, Surface Studio, and black-hole model checks
npm run validate:python   # independent standard-library Python validation
npm run build             # production Cloudflare-compatible build
npm test                  # physics tests + build + rendered-page checks
npm run lint
```

## What the application includes

### Home portal

- Four animated, keyboard-accessible circular shortcuts for Orbital Flight, Black Hole Laboratory, Surface Studio, and Contact Flight.
- Reduced-motion alternatives and laboratory-specific transition animation.
- A shared pearl/chrome theme with restrained blue, violet, pink, cyan, and gold light.

### Orbital Flight

- Editable orbit, spacecraft, propulsion, interruption, and mission-duration inputs.
- Earth, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, and Neptune central-body studies using catalogued radius and gravitational-parameter values.
- Multiple electric-spacecraft silhouettes and mission presets, plus baseline, applied-technology, and research-envelope scenarios.
- A Web Worker that propagates the reference and interrupted cases without tying up the interface.
- Separate Run, Play, Pause, timeline Reset, scrubber, jump-to-outage, and playback-speed controls.
- An interactive projected-3D body/orbit scene with mouse, touch, wheel, and keyboard camera controls, animated spacecraft, electric-plume visualizations, stars, and Sun context.
- Live altitude, speed, propellant, thrust, semimajor axis, eccentricity, and target-gate status.
- Altitude, propellant, and thrust charts on one common time axis with interruption shading.
- A result narrative generated from the current numerical output, not canned copy.
- Actual CSV export at the stored 60 s output cadence.
- Explanations, assumptions, primary references, and measured validation results.
- Responsive layouts, labelled controls, visible focus states, reduced-motion support, and textual chart/scene descriptions.

### Black Hole Laboratory

- A real interactive Three.js scene of an ideal rotating Kerr black hole with camera presets, mouse/touch rotation, zoom, animation, disk and jet context, and separate horizon/ergosphere/orbit guides.
- Editable mass, dimensionless spin, coordinate radius, orbit direction, probe type, and motion speed, with stellar-scale, Sagittarius A*, and M87* presets.
- Calculated gravitational radius, outer event horizon, equatorial static limit, prograde/retrograde photon orbit, and ISCO locations.
- Transparent rule-based diagnoses for stable circular orbit, unstable/capture regions, approximate tidal-gradient scale, and explicit statements of what is only illustrative.
- Primary references and a 2024 EHT research note without claiming the scene is a ray trace, a full Kerr geodesic integration, or a survival prediction.

### Surface Studio — Missionwear

- Three visibly distinct original concepts: lunar **MAX** with faceted dust guards and shadow-work lighting, Mars **MALTE** with asymmetric geology and abrasion panels, and the lighter open-head Earth-training **BASTIAN** loading garment. BASTIAN deliberately omits EVA pressure hardware.
- A real Three.js model loaded from a Blender-authored glTF asset. Its human silhouette is derived from Blender Studio’s CC0 Human Base Meshes v1.4.1, while the garments, helmet, named equipment, seams, joints, boots, backpack, staff, cat-ear pods, dust module, haptics, and assistive structures are original RIEVA geometry. A lightweight procedural fallback remains available if the asset cannot load.
- Mouse/touch orbit controls, wheel zoom, camera presets, clickable parts, exploded assembly, layered cutaway, detachable helmet in assembly mode, body-proportion presets, and explicitly illustrative walking, running, and jumping.
- Pearl/silver, white/champagne, and obsidian/gold palettes with visible thermal and optical caveats.
- Editable outer tailoring and mission accessories without implying that pockets or pants replace pressure architecture.
- Local save/load, validated JSON export, and canvas PNG export. No account or backend is involved.
- Moon, Mars, Earth-training, and hypothetical higher-gravity rules using stated mass, gravity, and accessory-power assumptions.
- Compatibility language limited to required items, conceptual combinations, and named unresolved conflicts—never a safety or certification score.
- An editable equipment/materials/reference catalog with operational-heritage, demonstrated-research, and original-concept labels.
- A test room that visualizes visor ray handling, dust mitigation, lights, antenna signals, haptic feedback, and walking-staff contact while keeping each effect’s evidence limits visible.
- Configurable torso tailoring, boot packages, shoulder camera, tether reel, sample kit, and pulsing/ghosted part inspection with one-click accessory fitting.

The suit model is an educational integration concept, not qualified hardware. Habitat clothing, launch/entry garments, and surface EVA equipment are explicitly distinguished. A cooling or compression garment alone is not vacuum protection.

### Contact Flight

- An original, unarmed **AERIS-X** research aircraft authored in Blender and exported as an optimized glTF asset: 63 named meshes, 3,760 vertices, and 6,772 triangles.
- Mouse/touch rotation, wheel or pinch zoom, front/top/side/reset cameras, clickable named parts, external/cutaway/exploded views, and a visible fallback if WebGL or the asset fails.
- A live wind-tunnel view with qualitative airflow streaks, pressure-wash overlays, and supersonic Mach-angle cues. These are explicitly not presented as CFD.
- Editable altitude, true airspeed, angle of attack, wing state, flow view, and unknown-event exercise inputs.
- Calculated 1976 standard-atmosphere state, Mach number, dynamic pressure, Reynolds number, low-order lift and drag, load factor, lift-to-drag ratio, and explicit out-of-model warnings.
- A clickable turbine path covering inlet, compressor, combustor, turbine, and nozzle, with polished MathML equations and clear boundaries around what is not calculated.
- Ten selectable resilience and observation modules. Every module publishes assumed mass, electrical power, and drag increments; all modules visibly toggle external or internal Blender geometry.
- Non-harmful first-contact exercises for an unidentified signal, radiation event, aerosol plume, sensor saturation, and navigation disagreement. The site does not implement weapons, biological agents, blinding systems, or destructive sonic/RF concepts.
- Local save/load, validated JSON export, 3D canvas screenshot export, reset, and transparent fixed-rule module suggestions.
- Separate research views for life/intelligence searches and aerodynamic/propulsion work, with publication dates, verification date, evidence labels, direct primary or authoritative links, and a visible “what this does not prove” note on every card.

The aircraft is a concept visualization and educational point model—not a CFD solution, stability-and-control model, engine deck, flight envelope, certification result, or claim of military superiority. NASA’s public X-59 educational STL was used only as a dimensional reference during Blender authoring and was removed before export; provenance and checksums are recorded in [`public/models/README.md`](public/models/README.md).

## Physics model

The orbital state is planar and centered on the selected spherical body. SI units are used internally. Earth is the independently validated baseline; other Solar System destinations use the same intentionally simplified two-body equations with catalogued body constants.

```text
r̈ = −μr / |r|³ + (T/m) ûv
ve = Isp g0
T = 2ηP / ve
ṁ = −T / ve
```

Baseline constants:

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

This is an educational first-order mission study, not a flight design or hardware qualification tool. It assumes constant propulsion efficiency and excludes atmospheric drag, body nonsphericity and harmonics, third bodies, rings, eclipses, radiation, thermal limits, solar-array degradation, power-processing losses beyond the single efficiency term, throttle maps, attitude dynamics, finite steering response, navigation uncertainty, plume interactions, and hardware lifetime constraints. Giant-planet altitude is measured from a reference radius rather than a solid surface.

The technology presets only change parameters represented by this model. The research envelope is explicitly hypothetical. Iodine and atmosphere-breathing propulsion are discussed as model boundaries; the site does not pretend its simple dynamics can evaluate their materials, plasma, intake, or drag physics.

## Validation

`scripts/validate.py` is independent of the TypeScript implementation and uses only the Python standard library. On 1 October 2026 it measured:

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
    RievaApp.tsx           state-preserving laboratory navigation
    HomePortal.tsx         animated four-laboratory homepage
    SimulatorApp.tsx       complete mission console and playback state
    OrbitScene.tsx         interactive projected-3D Canvas scene
    MissionCharts.tsx      accessible computed SVG charts
    KnowledgeSections.tsx  technology, physics, validation, references
    SurfaceStudio.tsx      collection, controls, inspector, rules, research
    SurfaceSuitScene.tsx   Blender glTF loader, articulated rig and fallback
    BlackHoleLab.tsx       Kerr controls, diagnosis, equations, references
    BlackHoleScene.tsx     interactive Three.js extreme-gravity scene
    ContactFlightLab.tsx   aerodynamics, systems, engine and research UI
    AircraftScene.tsx      Blender aircraft, wind tunnel and part selection
  workers/
    mission.worker.ts      worker protocol and simulation execution
lib/
  simulation/index.ts      framework-independent physics and RK4 solver
  orbital/catalog.ts       central bodies, spacecraft, research destinations
  black-hole/model.ts      Kerr radii and orbit/tidal diagnostics
  black-hole/catalog.ts    presets and primary references
  surface-studio/catalog.ts structured equipment, materials, palettes, sources
  surface-studio/rules.ts  persistence validation, mass/weight, mission rules
  contact-flight/model.ts  atmosphere, flight-point and configuration rules
  contact-flight/catalog.ts parts, modules, evidence and dated sources
  site-config.ts           single-source brand configuration
scripts/
  build_rieva_suits.py    reproducible Blender missionwear build pipeline
  build_aeris_x.py         reproducible original AERIS-X Blender pipeline
  validate.py              independent Python validation
public/models/
  rieva-missionwear.glb    authored MAX, MALTE and BASTIAN browser asset
  rieva-aeris-x.glb        named interactive Contact Flight aircraft asset
  README.md                model provenance, licenses and integration notes
tests/
  simulation.test.ts       numerical and event checks
  surface-studio.test.ts   persistence, requirements, mass and power checks
  black-hole.test.ts       Kerr boundary and diagnostic checks
  contact-flight.test.ts   atmosphere, force, persistence and rule checks
  aeris-asset.test.mjs     GLB geometry, metadata and loader checks
  rendered-html.test.mjs   production-render checks
```

### Rebuilding the missionwear asset

The checked-in `.glb` is ready to use and does not require Blender at runtime. To regenerate it, download Blender Studio’s **Human Base Meshes v1.4.1** bundle from the official Blender demo-files page, open `human_base_meshes_bundle.blend` with Blender 5, and run:

```bash
blender -b /path/to/human_base_meshes_bundle.blend \
  -P scripts/build_rieva_suits.py -- \
  --out public/models/rieva-missionwear.glb \
  --blend /tmp/rieva-missionwear.blend \
  --preview /tmp/rieva-missionwear-preview.png
```

The generated garment and equipment geometry is original to RIEVA. The anatomical scaffold is Blender Studio’s CC0 base mesh; its provenance is recorded alongside the asset.

## Primary references

- MIT OpenCourseWare 16.346, [Basic Two-Body Relations](https://ocw.mit.edu/courses/16-346-astrodynamics-fall-2008/dbce406df8d13e052f9229880ed96c02_lec_02.pdf).
- NASA/JPL, [Fundamentals of Electric Propulsion: Ion and Hall Thrusters](https://descanso.jpl.nasa.gov/SciTechBook/series4/Electric_Propulsion_2nd_edition.pdf), second edition.
- NASA EGM96, [Earth gravitational constant](https://cddis.nasa.gov/926/egm96/doc/S11.HTML).
- NASA NSSDC, [Earth Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html).
- NIST, [standard acceleration of gravity](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8).
- NASA, [HERMeS / AEPS performance overview](https://ntrs.nasa.gov/api/citations/20220007037/downloads/SP2022_438_CASSADY.pdf).
- Rafalskyi et al., [In-orbit demonstration of an iodine electric propulsion system](https://www.nature.com/articles/s41586-021-04015-y), *Nature* (2021).
- Blender Studio, [Human Base Meshes and their intended use](https://studio.blender.org/training/realistic-human-research/use-of-base-meshes/) and [official demo files](https://www.blender.org/download/demo-files/) (CC0 base-mesh source used for the missionwear anatomy).
- NASA Glenn, [Beginner’s Guide to Aeronautics](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/learn-about-aerodynamics/) and [Thrust Force](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/thrust-force/) (force definitions and idealized jet-thrust relation).
- NASA Astrobiology, [About Astrobiology](https://astrobiology.nasa.gov/about/) and NASA Science, [UAP FAQs](https://science.nasa.gov/uap/faqs/) (the explicit boundary that no extraterrestrial life or extraterrestrial UAP explanation has been confirmed).
- Hurowitz et al., [Redox-driven mineral and organic associations in Jezero Crater](https://www.nature.com/articles/s41586-025-09413-0), *Nature* 645 (2025), and Stevenson et al., [K2-18 b Does Not Meet the Standards of Evidence for Life](https://escholarship.org/uc/item/9w95v4ff), *The Astronomical Journal* 170 (2025).
- NASA Quesst, [X-59 flight-envelope update](https://www.nasa.gov/blogs/quesst/2026/10/02/nasas-x-59-completes-record-six-flights-in-one-week/) (2 October 2026) and NASA NTRS, [Coupled Adjoint Aerodynamic and Sonic Boom Propagation Optimization](https://ntrs.nasa.gov/citations/20250009072).

The complete dated Contact Flight reference map is rendered in the application from [`lib/contact-flight/catalog.ts`](lib/contact-flight/catalog.ts), verified 12 October 2026.

## Deployment

The production build uses the included vinext/Vite and Cloudflare Worker-compatible output. `.openai/hosting.json` contains only the Sites project metadata; the application needs no database or runtime secrets.
