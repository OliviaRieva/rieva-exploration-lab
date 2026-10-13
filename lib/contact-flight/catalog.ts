import type { ContactModuleId, EncounterScenario } from "./model.ts";

export type EvidenceLevel =
  | "operational heritage"
  | "flight or ground demonstration"
  | "peer-reviewed interpretation"
  | "contested candidate"
  | "active mission in development"
  | "bounded null result"
  | "original speculative concept";

export interface AircraftPart {
  id: string;
  name: string;
  short: string;
  function: string;
  airflow: string;
  tradeoff: string;
  evidence: EvidenceLevel;
  meshTokens: readonly string[];
}

export const aircraftParts: readonly AircraftPart[] = [
  {
    id: "fuselage",
    name: "Area-ruled blended fuselage",
    short: "Structure + wave shaping",
    function: "Carries the crew cell, tanks, systems, and the primary load path while blending into the wing to avoid abrupt cross-section changes.",
    airflow: "The long forebody turns the flow gradually. Near and above Mach 1, cross-sectional shaping influences how pressure waves combine, but the full result requires compressible CFD and measurement.",
    tradeoff: "A slender body reduces internal volume and complicates visibility, access, landing gear, and structural depth.",
    evidence: "flight or ground demonstration",
    meshTokens: ["PART_FUSELAGE"],
  },
  {
    id: "canopy",
    name: "Flush sensor-forward canopy",
    short: "Crew cell + optical apertures",
    function: "Provides a protected cockpit and low-distortion view apertures with independent external sensors as a second information path.",
    airflow: "A shallow canopy shoulder reduces a local pressure rise compared with a blunt bubble, but creates human-factors and optical-integration work.",
    tradeoff: "Optical coatings, bird impact, pressure loads, icing, emergency egress, and direct visibility must all be qualified together.",
    evidence: "operational heritage",
    meshTokens: ["PART_CANOPY"],
  },
  {
    id: "wing",
    name: "Cranked adaptive wing",
    short: "Lift + control",
    function: "A highly swept inner panel manages high-speed flow while the outer panel and continuous elevons provide lift and control authority at lower speed.",
    airflow: "Lift follows pressure integrated over the surface. The lab uses L = qSCₗ; it does not solve the three-dimensional vortices or shock-boundary-layer interaction.",
    tradeoff: "Thin swept wings trade low-speed lift and structural depth for high-speed drag behavior. Adaptive structures add actuators, fatigue cases, and certification work.",
    evidence: "flight or ground demonstration",
    meshTokens: ["PART_WING_L", "PART_WING_R"],
  },
  {
    id: "elevons",
    name: "Continuous trailing-edge elevons",
    short: "Pitch + roll + trim",
    function: "Combined pitch and roll surfaces vary the wing camber and redistribute load across the trailing edge.",
    airflow: "Deflection changes circulation and pressure. Smooth, gap-minimized surfaces may reduce noise and parasitic drag, but they do not eliminate hinge, actuator, or aeroelastic loads.",
    tradeoff: "Control effectiveness, reversal, thermal growth, flutter, and jam tolerance have to be demonstrated across the envelope.",
    evidence: "flight or ground demonstration",
    meshTokens: ["PART_ELEVON_L", "PART_ELEVON_R"],
  },
  {
    id: "intakes",
    name: "Twin embedded inlets",
    short: "Condition flow for the engine",
    function: "Capture external air and decelerate it before the compressor while keeping distorted boundary-layer flow away from the most sensitive fan region.",
    airflow: "The inlet trades pressure recovery against spillage, distortion, and external drag. At high incidence the approaching flow is not uniform.",
    tradeoff: "A beautiful flush inlet is not automatically a good inlet: separation and circumferential distortion can reduce compressor margin.",
    evidence: "operational heritage",
    meshTokens: ["PART_INTAKE_L", "PART_INTAKE_R"],
  },
  {
    id: "compressor",
    name: "Compressor and core",
    short: "Raise total pressure",
    function: "Alternating rotating and stationary blade rows add work to the air and convert velocity into pressure before heat addition.",
    airflow: "Compressor behavior depends on corrected mass flow, shaft speed, pressure ratio, and inlet distortion. The animated flow path is qualitative, not an engine map.",
    tradeoff: "Stall margin, tip clearance, temperature, fatigue, foreign-object damage, and transient matching limit the design.",
    evidence: "operational heritage",
    meshTokens: ["PART_ENGINE_CORE_L", "PART_ENGINE_CORE_R"],
  },
  {
    id: "nozzles",
    name: "Variable low-observable nozzles",
    short: "Turn pressure into jet momentum",
    function: "Expand hot gas to a high exhaust velocity and manage the engine operating line over the flight envelope.",
    airflow: "Net thrust is modeled conceptually by mass-flow momentum plus pressure thrust. Plume mixing, noise, infrared signature, and base drag are not solved here.",
    tradeoff: "Vectoring or variable geometry adds mass, seals, actuation, heat exposure, and failure modes.",
    evidence: "operational heritage",
    meshTokens: ["PART_NOZZLE_L", "PART_NOZZLE_R"],
  },
  {
    id: "tails",
    name: "Canted stabilizers",
    short: "Directional stability + trim",
    function: "Supply yaw and pitch authority with two canted surfaces instead of a single vertical tail and separate horizontal tail.",
    airflow: "Tail effectiveness depends on the wing wake and sideslip. Vortices that energize one condition can buffet another.",
    tradeoff: "Canted surfaces couple control axes and require a robust control law; geometry alone is not stability.",
    evidence: "operational heritage",
    meshTokens: ["PART_VTAIL_L", "PART_VTAIL_R"],
  },
] as const;

export interface EngineStage {
  id: string;
  index: string;
  name: string;
  state: string;
  explanation: string;
  misconception: string;
}

export const engineStages: readonly EngineStage[] = [
  {
    id: "inlet",
    index: "01",
    name: "Inlet / diffuser",
    state: "velocity ↓ · static pressure ↑",
    explanation: "Captures the freestream and presents the compressor with recoverable, acceptably uniform flow.",
    misconception: "It does not create energy; poor recovery or distortion takes margin away from the engine.",
  },
  {
    id: "compressor",
    index: "02",
    name: "Compressor",
    state: "shaft work in · total pressure ↑",
    explanation: "Rotor–stator stages add work and progressively raise total pressure and temperature.",
    misconception: "More pressure ratio is not free: efficiency, stability, blade speed, temperature, and weight constrain it.",
  },
  {
    id: "combustor",
    index: "03",
    name: "Combustor",
    state: "fuel + air · total temperature ↑",
    explanation: "Adds chemical energy while maintaining stable combustion and acceptable turbine-inlet temperature patterns.",
    misconception: "The combustor is not an explosion chamber; flame stability and controlled continuous heat release matter.",
  },
  {
    id: "turbine",
    index: "04",
    name: "Turbine",
    state: "gas work out · shaft power",
    explanation: "Extracts enough work from the hot stream to drive the compressor, accessories, and generators.",
    misconception: "Hotter is not always better: coatings, cooling, creep, oxidation, and life limits remain.",
  },
  {
    id: "nozzle",
    index: "05",
    name: "Nozzle",
    state: "pressure ↓ · exhaust velocity ↑",
    explanation: "Expands the remaining total pressure into a directed high-speed jet; pressure mismatch can also contribute to thrust.",
    misconception: "The colorful plume is illustrative. It does not compute chemistry, shocks, mixing, temperature, or acoustic load.",
  },
] as const;

export interface ContactModuleDetail {
  id: ContactModuleId;
  name: string;
  purpose: string;
  mechanism: string;
  limitation: string;
  integration: string;
  evidence: EvidenceLevel;
  visualName: string;
}

export const contactModuleDetails: readonly ContactModuleDetail[] = [
  {
    id: "spectral-sensor",
    name: "Multispectral observation fairing",
    purpose: "Observe before approaching: visible, thermal-infrared, ultraviolet, and polarization channels can describe an object without assuming it sees as humans do.",
    mechanism: "Co-registered passive sensors compare spatial and spectral changes while a shielded recorder preserves raw data.",
    limitation: "A spectrum does not reveal intent, intelligence, or physiology by itself; unfamiliar materials create ambiguous signatures.",
    integration: "Needs calibrated windows, vibration isolation, cooling, clean fields of view, and a fairing that does not corrupt inlet flow.",
    evidence: "flight or ground demonstration",
    visualName: "Dorsal faceted sensor crown",
  },
  {
    id: "sensor-shutters",
    name: "Fast sensor shutters",
    purpose: "Limit detector saturation and physical contamination while retaining redundant apertures.",
    mechanism: "Mechanical shutters, neutral-density paths, and sacrificial external windows can isolate a damaged or over-bright channel.",
    limitation: "They cannot promise protection from an unknown directed-energy source and may close at the wrong moment.",
    integration: "Requires fast fault detection, fail-safe positions, de-icing, optical calibration, and independent attitude references.",
    evidence: "operational heritage",
    visualName: "Iridescent aperture petals",
  },
  {
    id: "em-hardening",
    name: "Electromagnetic hardening package",
    purpose: "Reduce susceptibility to known electromagnetic interference and single failures in avionics paths.",
    mechanism: "Shielding, bonding, filtering, fiber links, surge protection, and physically separated redundant computers.",
    limitation: "No practical enclosure blocks every frequency or field strength, and this does not validate an ‘alien-proof’ aircraft.",
    integration: "Adds mass, inspection points, heat paths, connector rules, and demanding whole-aircraft compatibility tests.",
    evidence: "operational heritage",
    visualName: "Internal silver-violet avionics cage",
  },
  {
    id: "radiation-liner",
    name: "Localized radiation liner",
    purpose: "Reduce dose to critical avionics and the cockpit from specific, characterized particle and photon environments.",
    mechanism: "A graded stack uses hydrogen-rich polymer where useful, plus localized high-Z material only where secondary radiation is assessed.",
    limitation: "Atmospheric flight already benefits from shielding; mass grows quickly, and no thin liner stops all cosmic rays or unknown radiation.",
    integration: "The stack must be modeled for secondary particles, fire, toxicity, center of gravity, structure, and maintainability.",
    evidence: "operational heritage",
    visualName: "Cutaway amber crew-cell layer",
  },
  {
    id: "bio-isolation",
    name: "Sealed sampling and filtration loop",
    purpose: "Keep an external sample outside the occupied volume and reduce exposure to known aerosols and particulates.",
    mechanism: "Negative-pressure sample canister, staged filtration, sterilizable transfer path, and independent cabin recirculation.",
    limitation: "This is not an antibiotic shield. Unknown chemistry or biology may bypass assumptions; collection could be the greater hazard.",
    integration: "Needs leak detection, material compatibility, safe disposal, quarantine procedure, and ground containment.",
    evidence: "original speculative concept",
    visualName: "Ventral sealed sampler",
  },
  {
    id: "contact-array",
    name: "Wideband contact array",
    purpose: "Listen and record across multiple non-destructive channels before transmitting anything.",
    mechanism: "Passive radio reception, optical timing, and an internationally governed, low-power reply path kept physically inhibited by default.",
    limitation: "There is no evidence an extraterrestrial intelligence uses radio, light, sound, or any protocol we would recognize.",
    integration: "Antennas need electromagnetic cleanliness and a retracted high-speed state; any reply requires governance, not a pilot impulse.",
    evidence: "original speculative concept",
    visualName: "Retractable dorsal arc array",
  },
  {
    id: "redundant-controls",
    name: "Dissimilar redundant flight controls",
    purpose: "Keep basic attitude and navigation functions after a sensor, software, bus, or power-path fault.",
    mechanism: "Independent inertial sensing, segregated power, dissimilar computation, reversion laws, and a simple get-home mode.",
    limitation: "Common-mode errors and incorrect requirements can defeat redundancy; it does not counter unknown ‘manipulation.’",
    integration: "Every reversion must be testable and understandable under time pressure without creating contradictory control commands.",
    evidence: "operational heritage",
    visualName: "Internal cyan control trunks",
  },
  {
    id: "thermal-loop",
    name: "Auxiliary thermal rejection loop",
    purpose: "Carry heat from sensors and electronics to controllable sinks without exceeding component limits.",
    mechanism: "Pumped liquid loop, buffer storage, and flush surface heat exchangers schedule rejection around the flight condition.",
    limitation: "It moves heat; it does not destroy heat. Hot ambient conditions and high speed reduce the available margin.",
    integration: "Pumps, leaks, freeze protection, exchanger drag, and battle-damage language are deliberately avoided: this is a research system.",
    evidence: "flight or ground demonstration",
    visualName: "Pearlescent wing-root heat panels",
  },
  {
    id: "observer-pod",
    name: "Remote observation pod",
    purpose: "Separate sensing from the crewed aircraft so a puzzling object can be studied without immediately closing distance.",
    mechanism: "A recoverable or disposable passive recorder is released only inside a defined test range and relays low-rate observations.",
    limitation: "It is not a weapon, decoy, or proof against pursuit; release safety, airspace, and debris risk dominate real use.",
    integration: "Adds drag, mass, separation dynamics, communications load, and a serious store-clearance program.",
    evidence: "original speculative concept",
    visualName: "Belly-mounted observation buoy",
  },
  {
    id: "anomaly-detector",
    name: "Unknown-physics field monitor",
    purpose: "A playful placeholder for the user’s most imaginative ‘what if’ scenarios.",
    mechanism: "In fiction, cross-checks clocks, accelerometers, magnetometers, radiation counters, and gravimeters for correlated anomalies.",
    limitation: "There is no validated unknown-physics detector and no evidence of alien fields. A surprising reading is more likely sensor error or known environment.",
    integration: "Must never command the aircraft; raw channels, calibration injections, and independent review come first.",
    evidence: "original speculative concept",
    visualName: "Luminous tail-spine instrument",
  },
] as const;

export const encounterScenarios: readonly {
  id: EncounterScenario;
  name: string;
  prompt: string;
  response: string;
}[] = [
  {
    id: "unknown-signal",
    name: "Unidentified structured signal",
    prompt: "A repeatable pattern appears in optical and radio channels.",
    response: "Observe passively, preserve raw data, test local interference, seek independent confirmation, and do not transmit impulsively.",
  },
  {
    id: "radiation-event",
    name: "Unexpected radiation event",
    prompt: "Dosimeters disagree while avionics temperatures rise.",
    response: "Cross-check independent sensors, maximize distance, shield critical functions, shed nonessential load, and divert. No universal shield is implied.",
  },
  {
    id: "bioaerosol",
    name: "Unknown aerosol plume",
    prompt: "External samplers see particles with unfamiliar spectra.",
    response: "Avoid ingestion, isolate sampling, keep the occupied loop closed, mark the aircraft for quarantine, and assume neither danger nor safety.",
  },
  {
    id: "sensor-dazzle",
    name: "Optical sensor saturation",
    prompt: "One aperture saturates and navigation confidence falls.",
    response: "Close the affected channel, cross-check inertial and independent sensors, turn away, and record without directing energy back at the source.",
  },
  {
    id: "navigation-interference",
    name: "Navigation disagreement",
    prompt: "Satellite, inertial, magnetic, and visual solutions diverge.",
    response: "Use segregated references, bound uncertainty, slow the encounter, maintain terrain clearance, and exit toward a known recovery corridor.",
  },
] as const;

export interface ResearchItem {
  id: string;
  track: "life-search" | "flight-research";
  date: string;
  title: string;
  organization: string;
  finding: string;
  boundary: string;
  evidence: EvidenceLevel;
  url: string;
}

export const researchItems: readonly ResearchItem[] = [
  {
    id: "nasa-no-confirmed-life",
    track: "life-search",
    date: "NASA page; accessed 2026-10-12",
    title: "The starting line: no confirmed life beyond Earth",
    organization: "NASA Astrobiology / NASA Science",
    finding: "Astrobiology has increasingly capable ways to search for habitable environments, life chemistry, biosignatures, and technosignatures.",
    boundary: "NASA states that no life beyond Earth has been found and there is no credible evidence that UAP are extraterrestrial.",
    evidence: "operational heritage",
    url: "https://science.nasa.gov/uap/faqs/",
  },
  {
    id: "mars-cheyava",
    track: "life-search",
    date: "2025-09-10",
    title: "A potential biosignature in Jezero crater",
    organization: "Hurowitz et al. · Nature 645",
    finding: "Perseverance measured mineral and organic associations in the Cheyava Falls sample that satisfy NASA’s careful label ‘potential biosignature.’",
    boundary: "Abiotic pathways remain possible; laboratory study of a returned sample is needed before any claim of life.",
    evidence: "peer-reviewed interpretation",
    url: "https://www.nature.com/articles/s41586-025-09413-0",
  },
  {
    id: "k2-18-candidate",
    track: "life-search",
    date: "2025-04-17 / reanalysis 2025-10-07",
    title: "K2-18 b: a candidate that did not become a discovery",
    organization: "Madhusudhan et al. · Stevenson et al.",
    finding: "One retrieval reported model-sensitive evidence near three sigma for DMS or DMDS in a JWST spectrum.",
    boundary: "A peer-reviewed reanalysis found correlated noise/systematics and no significant evidence. Even confirmed DMS would require contextual false-positive work.",
    evidence: "contested candidate",
    url: "https://escholarship.org/uc/item/9w95v4ff",
  },
  {
    id: "seti-protocol",
    track: "life-search",
    date: "2026-06-01",
    title: "SETI verification before announcement or reply",
    organization: "International Academy of Astronautics / SETI Institute",
    finding: "The updated declaration emphasizes independent verification, secure archiving, transparent uncertainty, and broad communication.",
    boundary: "A protocol prepares for a possible detection; it is not evidence that a detection has occurred. Reply requires international consultation.",
    evidence: "operational heritage",
    url: "https://www.seti.org/research/seti-101/protocols-for-an-eti-signal-detection/",
  },
  {
    id: "technosignature-map",
    track: "life-search",
    date: "Updated 2025-07-03",
    title: "Technosignatures are broader than a radio message",
    organization: "NASA Science",
    finding: "Searches can examine narrowband radio or laser signals, unusual transits, atmospheric industrial chemistry, or excess infrared emission.",
    boundary: "Every channel has natural and human-made confounders. NASA’s overview reports search methods, not a confirmed technosignature.",
    evidence: "operational heritage",
    url: "https://science.nasa.gov/universe/search-for-life/searching-for-signs-of-intelligent-life-technosignatures/",
  },
  {
    id: "3i-atlas-null",
    track: "life-search",
    date: "2025-12-19",
    title: "3I/ATLAS observations return a bounded null result",
    organization: "Breakthrough Listen / SETI Institute",
    finding: "Targeted observations found no technosignatures in the searched bands, times, sensitivities, and signal classes; other evidence supports a natural interstellar object.",
    boundary: "A null result constrains only the completed search. It cannot prove that intelligence does not exist elsewhere—or even exhaust every signal type from one target.",
    evidence: "bounded null result",
    url: "https://www.seti.org/news/breakthrough-listen-observations-of-interstellar-object-3iatlas",
  },
  {
    id: "dragonfly-integration",
    track: "life-search",
    date: "2026-03-10",
    title: "Dragonfly enters rotorcraft integration",
    organization: "NASA / Johns Hopkins APL",
    finding: "The Titan rotorcraft moved into integration and test for a launch no earlier than 2028 and an arrival in late 2034.",
    boundary: "Dragonfly studies habitability and prebiotic chemistry. It is not a mission that can simply declare intelligent or even extant life.",
    evidence: "active mission in development",
    url: "https://science.nasa.gov/blogs/dragonfly/2026/03/10/nasas-dragonfly-mission-begins-rotorcraft-integration-testing-stage/",
  },
  {
    id: "enceladus-organics",
    track: "life-search",
    date: "2025-11-19",
    title: "Fresh organics from Enceladus’ ocean plume",
    organization: "NASA / Cassini science team",
    finding: "Reanalysis of ice grains collected close to Enceladus found a wider diversity of organic compounds from the subsurface ocean.",
    boundary: "Organic chemistry and ingredients for complex reactions are not organisms or a confirmed biosignature.",
    evidence: "peer-reviewed interpretation",
    url: "https://www.nasa.gov/missions/cassini/nasa-cassini-study-finds-organics-fresh-from-ocean-of-enceladus/",
  },
  {
    id: "bennu-prebiotic",
    track: "life-search",
    date: "2025-12-02",
    title: "Bennu samples expand the prebiotic inventory",
    organization: "NASA OSIRIS-REx",
    finding: "Returned asteroid material contains sugars and diverse organic compounds alongside earlier amino-acid and nucleobase results.",
    boundary: "Ingredients and reaction pathways are not cells, metabolism, evolution, or evidence that Bennu ever hosted life.",
    evidence: "peer-reviewed interpretation",
    url: "https://www.nasa.gov/missions/osiris-rex/sugars-gum-stardust-found-in-nasas-asteroid-bennu-samples/",
  },
  {
    id: "earth-extreme-eukaryote",
    track: "life-search",
    date: "2026-09-22",
    title: "Earth life widens one edge of the possibility space",
    organization: "NASA-funded research",
    finding: "Incendiamoeba cascadensis reproduces at 63 °C, extending the measured upper-temperature record for a eukaryote.",
    boundary: "An extreme Earth organism is an analogue for search strategy. It is not extraterrestrial and does not show that complex life is common.",
    evidence: "peer-reviewed interpretation",
    url: "https://science.nasa.gov/science-research/planetary-science/nasa-funded-research-finds-complex-life-defying-record-heat/",
  },
  {
    id: "hwo-detectors",
    track: "life-search",
    date: "2025-09-02",
    title: "Detector work for the Habitable Worlds Observatory",
    organization: "NASA Science",
    finding: "Single-photon sensor research supports a future observatory intended to directly study potentially habitable exoplanets and their spectra.",
    boundary: "HWO is in pre-formulation; this is enabling detector development, not an operating life-detection telescope.",
    evidence: "active mission in development",
    url: "https://science.nasa.gov/directorates/stmd/advancing-single-photon-sensing-image-sensors-to-enable-the-search-for-life-beyond-earth/",
  },
  {
    id: "earth-detecting-earth",
    track: "life-search",
    date: "2025-02-03",
    title: "Could an Earth-level civilization detect Earth?",
    organization: "Sheikh et al. · The Astronomical Journal",
    finding: "Researchers compared present-day human technosignatures and the distances from which present-day instruments might detect them.",
    boundary: "Detectability is strongly signal- and geometry-dependent; it does not predict how another civilization behaves or communicates.",
    evidence: "peer-reviewed interpretation",
    url: "https://arxiv.org/abs/2502.02614",
  },
  {
    id: "x59-envelope",
    track: "flight-research",
    date: "2026-10-02",
    title: "X-59 expands its flight envelope",
    organization: "NASA Quesst",
    finding: "NASA reported 38 flights and speeds up to Mach 1.53 during envelope expansion of its low-boom research aircraft.",
    boundary: "Flight count and speed do not yet establish the community-noise objective, and X-59 is a civil research aircraft—not a fighter benchmark.",
    evidence: "flight or ground demonstration",
    url: "https://www.nasa.gov/blogs/quesst/2026/10/02/nasas-x-59-completes-record-six-flights-in-one-week/",
  },
  {
    id: "catnlf-flight",
    track: "flight-research",
    date: "2026-02-11",
    title: "A scaled laminar-flow wing reaches flight test",
    organization: "NASA Armstrong",
    finding: "A scaled Crossflow Attenuated Natural Laminar Flow wing flew as an early test of shaping that delays transition on swept wings.",
    boundary: "It is an early test program; contamination, roughness, off-design flow, structure, and full-scale integration still matter.",
    evidence: "flight or ground demonstration",
    url: "https://www.nasa.gov/image-article/nasa-completes-first-flight-of-laminar-flow-scaled-wing-design/",
  },
  {
    id: "low-boom-adjoint",
    track: "flight-research",
    date: "2026-04",
    title: "Coupled adjoint optimization for low boom",
    organization: "Rodriguez et al. · Journal of Aircraft / NASA NTRS",
    finding: "A coupled CFD and atmospheric-propagation gradient method can efficiently move a shape toward a selected low-boom objective.",
    boundary: "An optimizer finds a solution to its model, objective, and constraints—not a universally best aircraft or a flight-qualified design.",
    evidence: "peer-reviewed interpretation",
    url: "https://ntrs.nasa.gov/citations/20250009072",
  },
  {
    id: "hybrid-electric",
    track: "flight-research",
    date: "2026-07-20",
    title: "Megawatt-class hybrid-electric flight demonstration",
    organization: "NASA / GE Aerospace",
    finding: "A modified Saab 340B program is demonstrating megawatt-class hybrid-electric propulsion hardware in flight at transport-aircraft altitude.",
    boundary: "A transport demonstrator does not make the same architecture suitable for a compact high-speed aircraft; mass, cooling, voltage, and certification remain.",
    evidence: "flight or ground demonstration",
    url: "https://www.nasa.gov/directorates/rtmd/nasa-ge-hybrid-electric-flight/",
  },
  {
    id: "pressure-paint",
    track: "flight-research",
    date: "2026-10-02",
    title: "Unsteady pressure becomes visible in a wind tunnel",
    organization: "NASA Langley",
    finding: "Pressure-sensitive paint mapped time-varying loads over a model wing, helping connect flow structures with distributed surface pressure.",
    boundary: "The paint improves measurement and validation; it does not itself improve aerodynamic performance.",
    evidence: "flight or ground demonstration",
    url: "https://www.nasa.gov/centers-and-facilities/langley/nasa-model-wing-lights-up-during-first-pressure-sensitive-paint-tests/",
  },
  {
    id: "boundary-layer-ingestion",
    track: "flight-research",
    date: "2024-02-15",
    title: "Boundary-layer ingestion: coupled benefit and distortion cost",
    organization: "NASA Advanced Supercomputing",
    finding: "Validated simulation and tunnel work studies how ingesting slower air near a body can reduce aircraft-level power demand when propulsion and airframe are designed together.",
    boundary: "Distortion, fan operability, durability, and integration can erase benefits; it is never a free thrust increase.",
    evidence: "flight or ground demonstration",
    url: "https://nas.nasa.gov/pubs/ams/2024/02-15-24.html",
  },
  {
    id: "hytec-cmc",
    track: "flight-research",
    date: "2025-03-31",
    title: "Compact hot cores and ceramic matrix composites",
    organization: "NASA HyTEC · NASA/CR-20250002768",
    finding: "NASA’s compact-core program tests aerodynamics, cooling, and ceramic-matrix-composite hot-section technologies intended to reduce fuel burn.",
    boundary: "Environmental coatings, oxidation, impact, manufacturing variability, life, inspection, and engine-level qualification remain decisive.",
    evidence: "flight or ground demonstration",
    url: "https://ntrs.nasa.gov/citations/20250002768",
  },
] as const;

export const researchVerificationDate = "2026-10-12";

export const sensingPossibilities = [
  {
    name: "Electromagnetic",
    examples: "Visible, ultraviolet, infrared, polarization, radio",
    honestRead: "Earth organisms use only parts of this range; a non-human system might use different bands. That is a design possibility, not alien evidence.",
  },
  {
    name: "Mechanical",
    examples: "Sound, vibration, pressure, substrate motion",
    honestRead: "Hearing-like sensing depends on a medium. High-intensity sound as a weapon is unsafe, range-limited, and scientifically unjustified here.",
  },
  {
    name: "Chemical",
    examples: "Volatiles, dissolved molecules, surface contact",
    honestRead: "Chemical sensing is widespread on Earth. Unknown chemistry makes both interpretation and containment difficult.",
  },
  {
    name: "Electric + magnetic",
    examples: "Local electric fields, geomagnetic direction",
    honestRead: "Some Earth species use these cues. That supports broad passive instrumentation—not claims about extraterrestrial senses.",
  },
] as const;
