"use client";

import { useCallback, useMemo, useState } from "react";
import {
  aircraftParts,
  contactModuleDetails,
  encounterScenarios,
  engineStages,
  researchItems,
  researchVerificationDate,
  sensingPossibilities,
  type EvidenceLevel,
} from "../../lib/contact-flight/catalog";
import {
  CONTACT_FLIGHT_ASSUMPTIONS,
  CONTACT_MODULES,
  DEFAULT_CONTACT_FLIGHT_CONFIGURATION,
  configurationWithScenarioSuggestions,
  decodeContactFlightConfiguration,
  encodeContactFlightConfiguration,
  evaluateContactFlight,
  normalizeContactFlightConfiguration,
  type ContactFlightConfiguration,
  type ContactModuleId,
  type FlowMode,
} from "../../lib/contact-flight/model";
import {
  AircraftScene,
  type AircraftAssemblyMode,
  type AircraftCameraPreset,
} from "./AircraftScene";
import styles from "./ContactFlightLab.module.css";

export interface ContactFlightLabProps {
  active?: boolean;
}

const STORAGE_KEY = "rieva-contact-flight-configuration-v1";

const evidenceLabels: Record<EvidenceLevel, string> = {
  "operational heritage": "Operational heritage",
  "flight or ground demonstration": "Flight / ground demonstration",
  "peer-reviewed interpretation": "Peer-reviewed interpretation",
  "contested candidate": "Contested candidate",
  "active mission in development": "Active mission in development",
  "bounded null result": "Bounded null result",
  "original speculative concept": "Original speculative concept",
};

const flowModes: readonly { id: FlowMode; name: string; note: string }[] = [
  { id: "streamlines", name: "Flow streaks", note: "Qualitative path cues" },
  { id: "pressure", name: "Pressure wash", note: "Illustrative upper/lower contrast" },
  { id: "shock-cues", name: "Shock cues", note: "Shown only above Mach 1" },
];

function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(value);
}

function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function EvidencePill({ level }: { level: EvidenceLevel }) {
  return <span className={styles.evidencePill} data-level={level}>{evidenceLabels[level]}</span>;
}

function EquationCard({
  label,
  math,
  note,
}: {
  label: string;
  math: React.ReactNode;
  note: string;
}) {
  return (
    <article className={styles.equationCard}>
      <span>{label}</span>
      <div className={styles.equation}>{math}</div>
      <p>{note}</p>
    </article>
  );
}

export function ContactFlightLab({ active = false }: ContactFlightLabProps) {
  const [configuration, setConfiguration] = useState<ContactFlightConfiguration>(() =>
    structuredClone(DEFAULT_CONTACT_FLIGHT_CONFIGURATION),
  );
  const [selectedPartId, setSelectedPartId] = useState("wing");
  const [assemblyMode, setAssemblyMode] = useState<AircraftAssemblyMode>("external");
  const [cameraPreset, setCameraPreset] = useState<AircraftCameraPreset>("perspective");
  const [cameraRequestKey, setCameraRequestKey] = useState(0);
  const [airflowRunning, setAirflowRunning] = useState(true);
  const [selectedEngineStage, setSelectedEngineStage] = useState("inlet");
  const [researchTrack, setResearchTrack] = useState<"life-search" | "flight-research">("life-search");
  const [persistenceMessage, setPersistenceMessage] = useState("Configuration is local to this browser.");

  const result = useMemo(() => evaluateContactFlight(configuration), [configuration]);
  const scenario = encounterScenarios.find((item) => item.id === configuration.scenario)!;
  const selectedPart = aircraftParts.find((part) => part.id === selectedPartId);
  const selectedModule = contactModuleDetails.find((module) => module.id === selectedPartId);
  const selectedStage = engineStages.find((stage) => stage.id === selectedEngineStage)!;
  const filteredResearch = researchItems.filter((item) => item.track === researchTrack);

  const updateConfiguration = useCallback(
    (patch: Partial<ContactFlightConfiguration>) => {
      setConfiguration((current) => normalizeContactFlightConfiguration({ ...current, ...patch }));
    },
    [],
  );

  const setModule = (id: ContactModuleId, enabled: boolean) => {
    setConfiguration((current) => normalizeContactFlightConfiguration({
      ...current,
      modules: { ...current.modules, [id]: enabled },
    }));
    setSelectedPartId(id);
    if (id === "em-hardening" || id === "radiation-liner" || id === "redundant-controls") {
      setAssemblyMode("cutaway");
    }
  };

  const requestCamera = (preset: AircraftCameraPreset) => {
    setCameraPreset(preset);
    setCameraRequestKey((value) => value + 1);
  };

  const saveConfiguration = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, encodeContactFlightConfiguration(configuration));
      setPersistenceMessage("Saved locally on this device.");
    } catch {
      setPersistenceMessage("Local storage is unavailable; export JSON instead.");
    }
  };

  const loadConfiguration = () => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setPersistenceMessage("No saved Contact Flight configuration was found.");
        return;
      }
      setConfiguration(decodeContactFlightConfiguration(stored));
      setPersistenceMessage("Loaded the locally saved configuration.");
    } catch {
      setPersistenceMessage("The saved configuration could not be read.");
    }
  };

  const resetConfiguration = () => {
    setConfiguration(structuredClone(DEFAULT_CONTACT_FLIGHT_CONFIGURATION));
    setAssemblyMode("external");
    setSelectedPartId("wing");
    requestCamera("perspective");
    setPersistenceMessage("Restored the documented baseline assumptions.");
  };

  const exportScreenshot = () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#contact-aircraft-stage canvas");
    if (!canvas) {
      setPersistenceMessage("The WebGL scene is not ready for a screenshot yet.");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = "rieva-aeris-x-configuration.png";
    anchor.click();
    setPersistenceMessage("Exported the current 3D view as PNG.");
  };

  const activeModuleCount = Object.values(configuration.modules).filter(Boolean).length;
  const liftBalancePercent = (result.loadFactor - 1) * 100;

  return (
    <main
      className={styles.lab}
      data-active={active ? "true" : "false"}
      aria-labelledby="contact-flight-title"
    >
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Laboratory 04 · Aerodynamics + astrobiology</p>
          <h1 id="contact-flight-title">
            Contact Flight
            <span>Question the unknown. Keep flying the known.</span>
          </h1>
          <p className={styles.heroLead}>
            Configure the original, unarmed <strong>AERIS-X</strong> atmospheric research aircraft,
            watch a transparent low-order flight model respond, open its twin engine flow path,
            and explore what the search for life and intelligence actually knows.
          </p>
          <div className={styles.heroActions}>
            <a href="#contact-aerodynamics">Enter the wind tunnel</a>
            <a href="#contact-research">Open the evidence observatory</a>
          </div>
        </div>
        <aside className={styles.truthCard} aria-label="Scientific starting point">
          <span className={styles.truthPulse} aria-hidden="true" />
          <p>Scientific starting point</p>
          <strong>No extraterrestrial life or intelligence has been confirmed.</strong>
          <span>
            Candidate biosignatures, unusual signals, habitable environments, and prebiotic
            chemistry are exciting research—not proof of aliens. Every item below keeps that boundary visible.
          </span>
          <small>Research snapshot verified {researchVerificationDate}</small>
        </aside>
      </section>

      <section className={styles.boundaryStatement} aria-label="Safety and scope boundary">
        <span>Unarmed research demonstrator</span>
        <p>
          The requested “alien attack” ideas are translated into non-harmful first-contact resilience:
          passive observation, sensor protection, isolation, redundant control, distance, and recovery.
          This lab does not design weapons, harmful biological agents, blinding systems, or destructive sound/RF effects.
        </p>
      </section>

      <section
        className={styles.flightLab}
        id="contact-aerodynamics"
        aria-labelledby="contact-aerodynamics-title"
      >
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Interactive aerodynamic studio</p>
            <h2 id="contact-aerodynamics-title">Put AERIS-X inside the flow.</h2>
          </div>
          <p>
            The Blender aircraft is real interactive geometry. The streaks and pressure colors are
            qualitative; the numbers come from a documented point model, not decorative curves or CFD.
          </p>
        </header>

        <div className={styles.studioGrid}>
          <aside className={styles.controlPanel} aria-label="Flight condition controls">
            <div className={styles.panelHeading}>
              <span>Flight condition</span>
              <strong>Atmosphere 01</strong>
            </div>

            <label className={styles.rangeControl}>
              <span><b>Altitude</b><output>{formatNumber(configuration.altitudeM / 1_000, 1)} km</output></span>
              <input
                type="range"
                min="0"
                max="20000"
                step="250"
                value={configuration.altitudeM}
                onChange={(event) => updateConfiguration({ altitudeM: Number(event.target.value) })}
              />
              <small>1976 standard-atmosphere equations, limited to 0–20 km.</small>
            </label>

            <label className={styles.rangeControl}>
              <span><b>True airspeed</b><output>{formatNumber(configuration.speedMps, 0)} m/s</output></span>
              <input
                type="range"
                min="45"
                max="620"
                step="5"
                value={configuration.speedMps}
                onChange={(event) => updateConfiguration({ speedMps: Number(event.target.value) })}
              />
              <small>Mach {result.mach.toFixed(2)} at the selected temperature.</small>
            </label>

            <label className={styles.rangeControl}>
              <span><b>Angle of attack</b><output>{configuration.angleOfAttackDeg.toFixed(1)}°</output></span>
              <input
                type="range"
                min="-6"
                max="20"
                step="0.2"
                value={configuration.angleOfAttackDeg}
                onChange={(event) => updateConfiguration({ angleOfAttackDeg: Number(event.target.value) })}
              />
              <small>Above 12°, separated-flow warnings replace confident predictions.</small>
            </label>

            <label className={styles.selectControl}>
              <span>Wing state</span>
              <select
                value={configuration.flightMode}
                onChange={(event) => updateConfiguration({
                  flightMode: event.target.value as ContactFlightConfiguration["flightMode"],
                })}
              >
                <option value="cruise">Clean cruise</option>
                <option value="adaptive">Adaptive camber — research</option>
                <option value="low-boom">Low-boom shaping study</option>
              </select>
            </label>

            <fieldset className={styles.flowPicker}>
              <legend>Flow visualization</legend>
              {flowModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={configuration.flowMode === mode.id}
                  onClick={() => updateConfiguration({ flowMode: mode.id })}
                >
                  <strong>{mode.name}</strong>
                  <small>{mode.note}</small>
                </button>
              ))}
            </fieldset>

            <label className={styles.selectControl}>
              <span>Unknown-event exercise</span>
              <select
                value={configuration.scenario}
                onChange={(event) => updateConfiguration({
                  scenario: event.target.value as ContactFlightConfiguration["scenario"],
                })}
              >
                {encounterScenarios.map((item) => (
                  <option value={item.id} key={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <button
              className={styles.suggestionButton}
              type="button"
              onClick={() => {
                setConfiguration((current) => configurationWithScenarioSuggestions(current));
                setPersistenceMessage("Applied the transparent rule-based module suggestion.");
              }}
            >
              Fit rule-based suggestion
            </button>
            <p className={styles.scenarioSummary}>{scenario.prompt}</p>
          </aside>

          <article className={styles.aircraftStage} id="contact-aircraft-stage">
            <div className={styles.stageToolbar}>
              <div aria-label="Aircraft view mode">
                {(["external", "cutaway", "exploded"] as const).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    aria-pressed={assemblyMode === mode}
                    onClick={() => setAssemblyMode(mode)}
                  >
                    {mode === "external" ? "Skin" : mode === "cutaway" ? "Cutaway" : "Exploded"}
                  </button>
                ))}
              </div>
              <div aria-label="Camera views">
                {(["perspective", "top", "side", "front"] as const).map((preset) => (
                  <button type="button" key={preset} onClick={() => requestCamera(preset)}>
                    {preset === "perspective" ? "Reset" : preset}
                  </button>
                ))}
              </div>
            </div>
            <AircraftScene
              className={styles.scene}
              active={active}
              configuration={configuration}
              result={result}
              selectedPartId={selectedPartId}
              onSelectPart={setSelectedPartId}
              cameraPreset={cameraPreset}
              cameraRequestKey={cameraRequestKey}
              assemblyMode={assemblyMode}
              airflowRunning={airflowRunning}
            />
            <div className={styles.stageOverlay}>
              <div>
                <span className={styles.liveDot} data-running={airflowRunning} />
                <strong>{airflowRunning ? "FLOW RUNNING" : "FLOW PAUSED"}</strong>
                <button type="button" onClick={() => setAirflowRunning((value) => !value)}>
                  {airflowRunning ? "Pause" : "Play"}
                </button>
              </div>
              <p>Drag · pinch/scroll · click a named component</p>
            </div>
            <div className={styles.flowLegend} aria-label="Visualization legend">
              <span><i data-color="cyan" /> lower-pressure cue</span>
              <span><i data-color="pink" /> higher-pressure cue</span>
              <span><i data-color="violet" /> path / shock cue</span>
            </div>
          </article>

          <aside className={styles.inspector} aria-live="polite">
            <div className={styles.panelHeading}>
              <span>Component inspector</span>
              <strong>{selectedModule ? "MODULE" : "AIRFRAME"}</strong>
            </div>
            {selectedModule ? (
              <>
                <EvidencePill level={selectedModule.evidence} />
                <h3>{selectedModule.name}</h3>
                <p className={styles.inspectorLead}>{selectedModule.purpose}</p>
                <dl className={styles.inspectorDetails}>
                  <div><dt>How it works</dt><dd>{selectedModule.mechanism}</dd></div>
                  <div><dt>What can fail</dt><dd>{selectedModule.limitation}</dd></div>
                  <div><dt>Aircraft integration</dt><dd>{selectedModule.integration}</dd></div>
                  <div><dt>Visible change</dt><dd>{selectedModule.visualName}</dd></div>
                </dl>
              </>
            ) : selectedPart ? (
              <>
                <EvidencePill level={selectedPart.evidence} />
                <h3>{selectedPart.name}</h3>
                <p className={styles.inspectorLead}>{selectedPart.function}</p>
                <dl className={styles.inspectorDetails}>
                  <div><dt>Airflow</dt><dd>{selectedPart.airflow}</dd></div>
                  <div><dt>Design trade</dt><dd>{selectedPart.tradeoff}</dd></div>
                </dl>
              </>
            ) : (
              <p>Select a lit part of the aircraft or one of the system modules.</p>
            )}
            <div className={styles.quickParts} aria-label="Quick component selection">
              {aircraftParts.map((part) => (
                <button
                  type="button"
                  key={part.id}
                  aria-pressed={selectedPartId === part.id}
                  onClick={() => setSelectedPartId(part.id)}
                >
                  {part.short}
                </button>
              ))}
            </div>
          </aside>
        </div>

        <div className={styles.metricStrip} aria-label="Calculated flight-point metrics">
          <article><span>Mach</span><strong>{result.mach.toFixed(2)}</strong><small>a = {formatNumber(result.speedOfSoundMps, 1)} m/s</small></article>
          <article><span>Dynamic pressure</span><strong>{(result.dynamicPressurePa / 1_000).toFixed(1)} kPa</strong><small>ρ = {result.densityKgM3.toFixed(3)} kg/m³</small></article>
          <article><span>Lift / weight</span><strong>{result.loadFactor.toFixed(2)} g</strong><small>{liftBalancePercent >= 0 ? "+" : ""}{liftBalancePercent.toFixed(1)}% vs level</small></article>
          <article><span>Estimated drag</span><strong>{(result.dragN / 1_000).toFixed(1)} kN</strong><small>Cᴅ = {result.dragCoefficient.toFixed(4)}</small></article>
          <article><span>Lift : drag</span><strong>{result.liftToDrag.toFixed(1)}</strong><small>Cₗ = {result.liftCoefficient.toFixed(3)}</small></article>
          <article><span>Reynolds number</span><strong>{(result.reynoldsNumber / 1e6).toFixed(1)}M</strong><small>mean chord {CONTACT_FLIGHT_ASSUMPTIONS.meanChordM} m</small></article>
        </div>

        <div className={styles.modelStatus} data-state={result.state}>
          <div>
            <span>{result.state === "balanced-study-point" ? "Point model balanced" : result.state === "attention-required" ? "Model attention" : "Outside simple model"}</span>
            <strong>This is not a flight envelope, CFD solution, or safety clearance.</strong>
          </div>
          {result.messages.length > 0 ? (
            <ul>{result.messages.map((message) => <li key={message}>{message}</li>)}</ul>
          ) : (
            <p>No automatic conflict was triggered at this educational point. Real trim, stability, propulsion, structure, and thermal analyses still remain.</p>
          )}
        </div>

        <div className={styles.equationGrid}>
          <EquationCard
            label="Dynamic pressure"
            math={
              <math display="block" aria-label="q equals one half rho V squared">
                <mi>q</mi><mo>=</mo><mfrac><mn>1</mn><mn>2</mn></mfrac><mi>ρ</mi><msup><mi>V</mi><mn>2</mn></msup>
              </math>
            }
            note="The pressure scale shared by the lift and drag estimates."
          />
          <EquationCard
            label="Aerodynamic forces"
            math={
              <math display="block" aria-label="Lift equals q S C L and drag equals q S C D">
                <mi>L</mi><mo>=</mo><mi>q</mi><mi>S</mi><msub><mi>C</mi><mi>L</mi></msub><mtext> </mtext>
                <mi>D</mi><mo>=</mo><mi>q</mi><mi>S</mi><msub><mi>C</mi><mi>D</mi></msub>
              </math>
            }
            note="Coefficient heuristics expose trends; they do not replace measured polars."
          />
          <EquationCard
            label="Flow similarity"
            math={
              <math display="block" aria-label="Mach equals V over a and Reynolds equals rho V c over mu">
                <mi>M</mi><mo>=</mo><mfrac><mi>V</mi><mi>a</mi></mfrac><mtext> </mtext>
                <mi>Re</mi><mo>=</mo><mfrac><mrow><mi>ρ</mi><mi>V</mi><mi>c</mi></mrow><mi>μ</mi></mfrac>
              </math>
            }
            note="Mach captures compressibility scale; Reynolds number captures viscous similarity."
          />
          <EquationCard
            label="Idealized net thrust"
            math={
              <math display="block" aria-label="Net thrust equals mass flow times exhaust velocity minus flight velocity plus pressure difference times exit area">
                <mi>F</mi><mo>=</mo><mover><mi>m</mi><mo>˙</mo></mover><mo>(</mo><msub><mi>V</mi><mi>e</mi></msub><mo>−</mo><msub><mi>V</mi><mn>0</mn></msub><mo>)</mo>
                <mo>+</mo><mo>(</mo><msub><mi>p</mi><mi>e</mi></msub><mo>−</mo><msub><mi>p</mi><mn>0</mn></msub><mo>)</mo><msub><mi>A</mi><mi>e</mi></msub>
              </math>
            }
            note="The scene does not compute a real engine map, nozzle chemistry, or installed thrust."
          />
        </div>
      </section>

      <section className={styles.engineSection} aria-labelledby="contact-engine-title">
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Clickable propulsion cutaway</p>
            <h2 id="contact-engine-title">Follow the air, not the flame.</h2>
          </div>
          <p>
            Select a station to trace what changes through a gas-turbine flow path. Open Cutaway
            or Exploded mode above to expose the named engine meshes.
          </p>
        </header>
        <div className={styles.engineFlow}>
          <div className={styles.engineDiagram} aria-label="Simplified turbine engine flow path">
            <span className={styles.engineAir} aria-hidden="true" />
            {engineStages.map((stage) => (
              <button
                type="button"
                key={stage.id}
                aria-pressed={selectedEngineStage === stage.id}
                onClick={() => {
                  setSelectedEngineStage(stage.id);
                  setAssemblyMode("cutaway");
                  setSelectedPartId(stage.id === "nozzle" ? "nozzles" : stage.id === "inlet" ? "intakes" : "compressor");
                }}
              >
                <span>{stage.index}</span>
                <strong>{stage.name}</strong>
                <small>{stage.state}</small>
              </button>
            ))}
          </div>
          <article className={styles.engineExplanation}>
            <span>Station {selectedStage.index}</span>
            <h3>{selectedStage.name}</h3>
            <p>{selectedStage.explanation}</p>
            <div><strong>Keep honest</strong>{selectedStage.misconception}</div>
          </article>
        </div>
      </section>

      <section
        className={styles.systemsSection}
        id="contact-systems"
        aria-labelledby="contact-systems-title"
      >
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Unknown-encounter systems</p>
            <h2 id="contact-systems-title">Resilience without imaginary invincibility.</h2>
          </div>
          <p>
            Each switch changes a named Blender mesh or internal cutaway layer and recalculates stated
            mass, power, and zero-lift drag assumptions. No “survival score” is invented.
          </p>
        </header>

        <div className={styles.scenarioBanner}>
          <div><span>Exercise</span><strong>{scenario.name}</strong></div>
          <p>{scenario.response}</p>
          <small>Rule-based suggestion · not AI-certified · no assumption of hostile intent</small>
        </div>

        <div className={styles.moduleGrid}>
          {CONTACT_MODULES.map((module) => {
            const details = contactModuleDetails.find((item) => item.id === module.id)!;
            const enabled = configuration.modules[module.id];
            return (
              <article key={module.id} data-enabled={enabled ? "true" : "false"}>
                <div className={styles.moduleTopline}>
                  <EvidencePill level={details.evidence} />
                  <label className={styles.switchControl}>
                    <span className="sr-only">{enabled ? "Remove" : "Fit"} {module.name}</span>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) => setModule(module.id, event.target.checked)}
                    />
                    <i aria-hidden="true" />
                  </label>
                </div>
                <button
                  type="button"
                  className={styles.moduleInspectButton}
                  onClick={() => {
                    setSelectedPartId(module.id);
                    if (!module.visible) setAssemblyMode("cutaway");
                  }}
                >
                  <strong>{module.name}</strong>
                  <span>{details.purpose}</span>
                </button>
                <dl className={styles.moduleAssumptions}>
                  <div><dt>Mass</dt><dd>+{module.massKg} kg</dd></div>
                  <div><dt>Power</dt><dd>{module.electricalPowerKw.toFixed(1)} kW</dd></div>
                  <div><dt>ΔCᴅ₀</dt><dd>{module.deltaCd0.toFixed(4)}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>

        <div className={styles.systemSummary}>
          <article><span>Active modules</span><strong>{activeModuleCount} / {CONTACT_MODULES.length}</strong><small>Every value is a catalog assumption.</small></article>
          <article><span>Added mass</span><strong>{formatNumber(result.moduleMassKg, 0)} kg</strong><small>Total modeled mass {formatNumber(result.totalMassKg, 0)} kg.</small></article>
          <article><span>Electrical demand</span><strong>{result.modulePowerKw.toFixed(1)} kW</strong><small>of {CONTACT_FLIGHT_ASSUMPTIONS.systemsPowerBudgetKw} kW stated mission-system budget.</small></article>
          <article><span>Added Cᴅ₀</span><strong>{result.moduleDragIncrement.toFixed(4)}</strong><small>Illustrative increments—not wind-tunnel data.</small></article>
        </div>

        <div className={styles.failureMatrix}>
          <header>
            <span>Failure-control map</span>
            <p>Protection means lowering a known risk and retaining a way out—not promising the aircraft cannot be damaged or manipulated.</p>
          </header>
          <div><strong>Flight upset</strong><span>Dissimilar controls + inertial reversion</span><small>Cannot override insufficient lift, structural overload, or bad requirements.</small></div>
          <div><strong>Sensor loss</strong><span>Shutters + separated spectral channels</span><small>Redundancy can share hidden common-mode errors.</small></div>
          <div><strong>Unknown particulate</strong><span>Distance + sealed sampling + quarantine</span><small>This is not an antibiotic shield or a claim of universal biological protection.</small></div>
          <div><strong>Radiation / EMI</strong><span>Characterized shielding + filtering + divert</span><small>No material is a magic shield against unknown energy.</small></div>
          <div><strong>Ambiguous signal</strong><span>Raw recording + independent verification</span><small>Unusual does not mean artificial, intelligent, or hostile.</small></div>
        </div>

        <div className={styles.persistenceBar}>
          <div>
            <button type="button" onClick={saveConfiguration}>Save locally</button>
            <button type="button" onClick={loadConfiguration}>Load</button>
            <button type="button" onClick={resetConfiguration}>Reset</button>
            <button
              type="button"
              onClick={() => downloadText("rieva-aeris-x-configuration.json", encodeContactFlightConfiguration(configuration))}
            >
              Export JSON
            </button>
            <button type="button" onClick={exportScreenshot}>Export image</button>
          </div>
          <p role="status" aria-live="polite">{persistenceMessage}</p>
        </div>
      </section>

      <section
        className={styles.researchSection}
        id="contact-research"
        aria-labelledby="contact-research-title"
      >
        <header className={styles.researchHeader}>
          <p className={styles.eyebrow}>Evidence observatory · Verified {researchVerificationDate}</p>
          <h2 id="contact-research-title">Research-informed, not certainty-decorated.</h2>
          <p>
            A curated snapshot of current primary and authoritative sources. “All cutting-edge research”
            is not a finite or honest promise, so this map favors traceable claims, dates, null results,
            contested interpretations, and the experiments that could change the answer.
          </p>
          <div className={styles.researchTabs} role="tablist" aria-label="Research track">
            <button
              role="tab"
              type="button"
              aria-selected={researchTrack === "life-search"}
              onClick={() => setResearchTrack("life-search")}
            >
              Life + intelligence search
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={researchTrack === "flight-research"}
              onClick={() => setResearchTrack("flight-research")}
            >
              Aerodynamics + propulsion
            </button>
          </div>
        </header>

        {researchTrack === "life-search" ? (
          <div className={styles.evidenceLadder}>
            <article><span>01</span><strong>Habitable environment</strong><p>Conditions could permit life. This is not evidence that life exists.</p></article>
            <article><span>02</span><strong>Prebiotic ingredients</strong><p>Water, organics, and energy pathways support chemistry—not organisms.</p></article>
            <article><span>03</span><strong>Candidate biosignature</strong><p>A feature may fit biology, but abiotic routes and instrument effects must be rejected.</p></article>
            <article><span>04</span><strong>Independent confirmation</strong><p>Different instruments, teams, epochs, and contextual evidence must converge.</p></article>
            <article><span>05</span><strong>Technosignature</strong><p>An artificial origin must outperform interference, natural sources, and human contamination.</p></article>
          </div>
        ) : (
          <div className={styles.evidenceLadder}>
            <article><span>01</span><strong>Concept</strong><p>A physical mechanism and measurable benefit are proposed.</p></article>
            <article><span>02</span><strong>Simulation</strong><p>Results remain conditional on geometry, models, grid, boundary conditions, and objectives.</p></article>
            <article><span>03</span><strong>Ground demonstration</strong><p>Wind tunnels and rigs test selected scales and controlled environments.</p></article>
            <article><span>04</span><strong>Flight demonstration</strong><p>A bounded envelope supplies real integration and operations evidence.</p></article>
            <article><span>05</span><strong>Qualified system</strong><p>Durability, manufacturing, maintenance, safety, certification, and mission economics still decide adoption.</p></article>
          </div>
        )}

        <div className={styles.researchGrid} role="tabpanel">
          {filteredResearch.map((item) => (
            <article key={item.id}>
              <div className={styles.researchMeta}>
                <time>{item.date}</time>
                <EvidencePill level={item.evidence} />
              </div>
              <h3>{item.title}</h3>
              <span className={styles.researchOrg}>{item.organization}</span>
              <p>{item.finding}</p>
              <div className={styles.researchBoundary}>
                <strong>What it does not prove</strong>
                {item.boundary}
              </div>
              <a href={item.url} target="_blank" rel="noreferrer">Open primary / authoritative source ↗</a>
            </article>
          ))}
        </div>

        {researchTrack === "life-search" ? (
          <div className={styles.sensesSection}>
            <header>
              <p className={styles.eyebrow}>Could another creature sense differently?</p>
              <h3>Instrument broadly; do not invent a weakness.</h3>
              <p>
                Earth biology justifies looking beyond human sight and hearing. It does not justify a
                frequency “that makes aliens explode,” a guessed pathogen, or any claim about alien anatomy.
              </p>
            </header>
            <div>
              {sensingPossibilities.map((sense) => (
                <article key={sense.name}>
                  <strong>{sense.name}</strong>
                  <span>{sense.examples}</span>
                  <p>{sense.honestRead}</p>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.methodNote}>
            <span>Why this aircraft is not called “better than an F-35”</span>
            <p>
              “Better” requires a mission, constraints, validated data, and usually classified details that
              this independent concept does not have. AERIS-X is an original unarmed demonstrator used to
              expose aerodynamic and integration tradeoffs—not a claim of superior military performance.
            </p>
          </div>
        )}
      </section>

      <footer className={styles.footerNote}>
        <div>
          <strong>RIEVA · Contact Flight</strong>
          <span>Original Blender geometry · educational low-order model · independent research concept</span>
        </div>
        <p>
          Source dates are publication dates where available; every research card was checked on {researchVerificationDate}.
          Links open the cited organization or paper. No affiliation with NASA, MIT, any aircraft manufacturer, or defense organization is claimed.
        </p>
      </footer>
    </main>
  );
}
