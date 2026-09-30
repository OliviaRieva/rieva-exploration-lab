"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  equipmentCatalog,
  palettes,
  pantsStyles,
  references,
  suitConcepts,
  type EvidenceLevel,
  type MissionId,
} from "../../lib/surface-studio/catalog";
import {
  DEFAULT_STUDIO_CONFIGURATION,
  accessoryAssumptions,
  bodyMassKg,
  decodeStudioConfiguration,
  encodeStudioConfiguration,
  evaluateStudioConfiguration,
  missionLabels,
  normalizeStudioConfiguration,
  type StudioConfiguration,
} from "../../lib/surface-studio/rules";

const SurfaceSuitScene = lazy(() =>
  import("./SurfaceSuitScene").then((module) => ({
    default: module.SurfaceSuitScene,
  })),
);

const STORAGE_KEY = "rievastra-surface-studio-v1";

const evidenceLabels: Record<EvidenceLevel, string> = {
  "operational-heritage": "Operational heritage",
  "demonstrated-research": "Demonstrated research",
  "original-concept": "Original speculative integration",
};

const missionForConcept: Record<StudioConfiguration["conceptId"], MissionId> = {
  selene: "moon",
  areo: "mars",
  vector: "earth",
};

function formatNumber(value: number, digits = 1) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function downloadConfiguration(config: StudioConfiguration) {
  const blob = new Blob([encodeStudioConfiguration(config)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `rievastra-${config.conceptId}-configuration.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export interface SurfaceStudioProps {
  active?: boolean;
}

export function SurfaceStudio({ active = false }: SurfaceStudioProps) {
  const [config, setConfig] = useState<StudioConfiguration>(() =>
    normalizeStudioConfiguration(DEFAULT_STUDIO_CONFIGURATION),
  );
  const [selectedPartId, setSelectedPartId] = useState("helmet-shell");
  const [exploded, setExploded] = useState(false);
  const [cutaway, setCutaway] = useState(false);
  const [walking, setWalking] = useState(false);
  const [notice, setNotice] = useState("");
  const [sceneActivated, setSceneActivated] = useState(active);

  useEffect(() => {
    if (!active || sceneActivated) return;
    const timer = window.setTimeout(() => setSceneActivated(true), 0);
    return () => window.clearTimeout(timer);
  }, [active, sceneActivated]);

  const concept =
    suitConcepts.find((candidate) => candidate.id === config.conceptId) ??
    suitConcepts[0];
  const palette =
    palettes.find((candidate) => candidate.id === config.paletteId) ?? palettes[0];
  const selectedItem =
    equipmentCatalog.find((item) => item.id === selectedPartId) ??
    equipmentCatalog[0];
  const selectedSources = references.filter((reference) =>
    selectedItem.sourceIds.includes(reference.id),
  );
  const compatibility = useMemo(
    () => evaluateStudioConfiguration(config),
    [config],
  );
  const groups = useMemo(
    () => Array.from(new Set(equipmentCatalog.map((item) => item.group))),
    [],
  );

  const updateConfig = (
    updater: (current: StudioConfiguration) => StudioConfiguration,
  ) => {
    setConfig((current) => normalizeStudioConfiguration(updater(current)));
    setNotice("");
  };

  const chooseConcept = (conceptId: StudioConfiguration["conceptId"]) => {
    const next = suitConcepts.find((candidate) => candidate.id === conceptId);
    if (!next) return;
    updateConfig((current) => ({
      ...current,
      conceptId,
      paletteId: next.paletteId,
      mission: missionForConcept[conceptId],
      mode: conceptId === "vector" ? "assembly" : "mission",
      helmetAttached: true,
    }));
  };

  const toggleAccessory = (key: keyof StudioConfiguration["accessories"]) => {
    updateConfig((current) => ({
      ...current,
      accessories: {
        ...current.accessories,
        [key]: !current.accessories[key],
      },
    }));
    const partId: Record<keyof StudioConfiguration["accessories"], string> = {
      catEars: "cat-ear-pods",
      staff: "walking-staff",
      assist: "assist-module",
      dust: "dust-module",
      haptics: "haptic-module",
    };
    setSelectedPartId(partId[key]);
  };

  const saveLocal = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, encodeStudioConfiguration(config));
      setNotice("Configuration saved on this device.");
    } catch {
      setNotice("Local saving is unavailable in this browser. Export JSON instead.");
    }
  };

  const loadLocal = () => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        setNotice("No saved Surface Studio configuration was found on this device.");
        return;
      }
      setConfig(decodeStudioConfiguration(saved));
      setNotice("Saved configuration loaded.");
    } catch {
      setNotice("The saved configuration could not be read.");
    }
  };

  const resetStudio = () => {
    setConfig(normalizeStudioConfiguration(DEFAULT_STUDIO_CONFIGURATION));
    setSelectedPartId("helmet-shell");
    setExploded(false);
    setCutaway(false);
    setWalking(false);
    setNotice("Studio reset to SELENE defaults.");
  };

  return (
    <div className="surface-studio-shell">
      <section className="surface-hero" aria-labelledby="surface-title">
        <div className="surface-hero-copy">
          <p className="surface-kicker">Surface Studio · Missionwear</p>
          <h1 id="surface-title">Protective systems, tailored with intent.</h1>
          <p>
            An interactive aerospace design exhibition where operational suit
            architecture, active research, and original proposals remain visibly
            separate. Configure the silhouette, inspect every layer, and test a
            concept against a mission—without calling it certified.
          </p>
          <div className="surface-evidence-key" aria-label="Evidence categories">
            <span><i className="evidence-dot evidence-dot--heritage" />Operational heritage</span>
            <span><i className="evidence-dot evidence-dot--research" />Demonstrated research</span>
            <span><i className="evidence-dot evidence-dot--concept" />Original concept</span>
          </div>
        </div>
        <div className="surface-hero-orbit" aria-hidden="true">
          <div className="surface-hero-sphere" />
          <span>FORM</span><span>FUNCTION</span><span>EVIDENCE</span>
        </div>
      </section>

      <section
        className="surface-section surface-collection"
        id="surface-collection"
        aria-labelledby="collection-title"
      >
        <div className="surface-section-heading">
          <div>
            <p className="surface-kicker">Collection 01—03</p>
            <h2 id="collection-title">Three systems. Three honest boundaries.</h2>
          </div>
          <p>
            SELENE and AREO are independent surface-EVA concepts. VECTOR is an
            Earth research garment and never substitutes for pressure protection.
          </p>
        </div>
        <div className="concept-gallery">
          {suitConcepts.map((candidate, index) => (
            <button
              className="concept-card"
              type="button"
              key={candidate.id}
              aria-pressed={config.conceptId === candidate.id}
              onClick={() => chooseConcept(candidate.id)}
            >
              <span className={`concept-figure concept-figure--${candidate.id}`} aria-hidden="true">
                <i className="concept-figure-head" />
                <i className="concept-figure-body" />
                <i className="concept-figure-legs" />
              </span>
              <span className="concept-index">0{index + 1}</span>
              <span className="concept-name">{candidate.name}</span>
              <span className="concept-subtitle">{candidate.subtitle}</span>
              <span className="concept-class">{candidate.garmentClass}</span>
              <span className="concept-description">{candidate.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section
        className="surface-section studio-workbench"
        id="surface-configurator"
        aria-labelledby="configurator-title"
      >
        <div className="studio-titlebar">
          <div>
            <p className="surface-kicker">Interactive assembly</p>
            <h2 id="configurator-title">Configure {concept.name}.</h2>
          </div>
          <p>
            Drag or touch to rotate, scroll to zoom, and select a model part to
            synchronize the materials inspector.
          </p>
        </div>

        <div className="studio-grid">
          <aside className="studio-controls" aria-label="Suit configuration controls">
            <fieldset>
              <legend>Palette</legend>
              <div className="palette-list">
                {palettes.map((candidate) => (
                  <button
                    type="button"
                    key={candidate.id}
                    aria-pressed={config.paletteId === candidate.id}
                    onClick={() =>
                      updateConfig((current) => ({
                        ...current,
                        paletteId: candidate.id,
                      }))
                    }
                  >
                    <span className="palette-swatches" aria-hidden="true">
                      <i style={{ background: candidate.base }} />
                      <i style={{ background: candidate.secondary }} />
                      <i style={{ background: candidate.accent }} />
                    </span>
                    <span><strong>{candidate.name}</strong><small>{candidate.description}</small></span>
                  </button>
                ))}
              </div>
              <p className="control-caveat">{palette.thermalNote}</p>
            </fieldset>

            <fieldset>
              <legend>Fit and outer tailoring</legend>
              <label className="surface-field">
                <span>Body-proportion preset</span>
                <select
                  value={config.bodyPreset}
                  onChange={(event) =>
                    updateConfig((current) => ({
                      ...current,
                      bodyPreset: event.currentTarget.value as StudioConfiguration["bodyPreset"],
                    }))
                  }
                >
                  <option value="compact">Compact · assumed wearer 62 kg</option>
                  <option value="standard">Standard · assumed wearer 75 kg</option>
                  <option value="tall">Tall · assumed wearer 90 kg</option>
                </select>
              </label>
              <label className="surface-field">
                <span>Lower-body outer style</span>
                <select
                  value={config.pantsStyle}
                  onChange={(event) =>
                    updateConfig((current) => ({
                      ...current,
                      pantsStyle: event.currentTarget.value as StudioConfiguration["pantsStyle"],
                    }))
                  }
                >
                  {pantsStyles.map((style) => (
                    <option key={style.id} value={style.id}>{style.name}</option>
                  ))}
                </select>
              </label>
              <p className="control-caveat">
                {pantsStyles.find((style) => style.id === config.pantsStyle)?.note}
              </p>
            </fieldset>

            <fieldset>
              <legend>Mode and layers</legend>
              <div className="segmented-control" role="group" aria-label="Suit interaction mode">
                <button
                  type="button"
                  aria-pressed={config.mode === "mission"}
                  onClick={() => updateConfig((current) => ({ ...current, mode: "mission", helmetAttached: true }))}
                >Mission mode</button>
                <button
                  type="button"
                  aria-pressed={config.mode === "assembly"}
                  onClick={() => updateConfig((current) => ({ ...current, mode: "assembly" }))}
                >Display / assembly</button>
              </div>
              <label className="surface-switch">
                <input
                  type="checkbox"
                  checked={config.helmetAttached}
                  disabled={config.mode === "mission"}
                  onChange={(event) =>
                    updateConfig((current) => ({
                      ...current,
                      helmetAttached: event.currentTarget.checked,
                    }))
                  }
                />
                <span>Helmet attached</span>
              </label>
              <label className="surface-switch">
                <input type="checkbox" checked={exploded} onChange={(event) => setExploded(event.currentTarget.checked)} />
                <span>Exploded equipment view</span>
              </label>
              <label className="surface-switch">
                <input type="checkbox" checked={cutaway} onChange={(event) => setCutaway(event.currentTarget.checked)} />
                <span>Layered torso cutaway</span>
              </label>
              <label className="surface-switch">
                <input type="checkbox" checked={walking} onChange={(event) => setWalking(event.currentTarget.checked)} />
                <span>Illustrative walking animation</span>
              </label>
              <p className="control-caveat">
                The motion is a visual communication aid, not a biomechanical or pressurized-suit mobility model.
              </p>
            </fieldset>

            <fieldset>
              <legend>Mission accessories</legend>
              {(
                [
                  ["catEars", "Cat-ear antenna / light pods"],
                  ["staff", "Adjustable walking staff"],
                  ["assist", "Assistive lower-body module"],
                  ["dust", "Dust-mitigation gaiter module"],
                  ["haptics", "Haptic feedback module"],
                ] as Array<[keyof StudioConfiguration["accessories"], string]>
              ).map(([key, label]) => (
                <label className="surface-switch" key={key}>
                  <input
                    type="checkbox"
                    checked={config.accessories[key]}
                    onChange={() => toggleAccessory(key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>

            <div className="studio-file-actions" aria-label="Configuration file actions">
              <button type="button" onClick={saveLocal}>Save locally</button>
              <button type="button" onClick={loadLocal}>Load saved</button>
              <button type="button" onClick={() => downloadConfiguration(config)}>Export JSON</button>
              <button type="button" onClick={resetStudio}>Reset studio</button>
            </div>
            <p className="studio-notice" aria-live="polite">{notice}</p>
          </aside>

          <div className="studio-stage-column">
            <div className="studio-stage-meta">
              <div>
                <span>{concept.name}</span>
                <strong>{palette.name}</strong>
              </div>
              <p>Actual procedural 3D geometry · no external model asset</p>
            </div>
            {sceneActivated ? (
              <Suspense
                fallback={
                  <div className="surface-scene-activation" role="status">
                    Preparing the procedural suit studio…
                  </div>
                }
              >
                <SurfaceSuitScene
                  palette={palette}
                  bodyPreset={config.bodyPreset}
                  selectedPartId={selectedPartId}
                  helmetAttached={config.helmetAttached}
                  exploded={exploded}
                  cutaway={cutaway}
                  walking={walking}
                  catEars={config.accessories.catEars}
                  staff={config.accessories.staff}
                  assistModule={config.accessories.assist}
                  dustModule={config.accessories.dust}
                  haptics={config.accessories.haptics}
                  pantsStyle={config.pantsStyle}
                  onSelectPart={setSelectedPartId}
                />
              </Suspense>
            ) : (
              <div className="surface-scene-activation" aria-hidden="true">
                Interactive 3D studio loads when this laboratory opens.
              </div>
            )}
            <div className="studio-stage-disclaimer">
              <strong>Independent concept exhibition.</strong>
              <span>No NASA, MIT, Axiom, Prada, or other company affiliation is claimed. The complete suit has not been qualified or tested.</span>
            </div>
          </div>

          <aside className="equipment-inspector" aria-labelledby="inspector-title">
            <div className="inspector-heading">
              <p className="surface-kicker">Equipment inspector</p>
              <h3 id="inspector-title">Select a system.</h3>
            </div>
            <div className="equipment-index" aria-label="Equipment parts">
              {groups.map((group) => (
                <div className="equipment-group" key={group}>
                  <span>{group}</span>
                  {equipmentCatalog
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        aria-pressed={selectedItem.id === item.id}
                        onClick={() => setSelectedPartId(item.id)}
                      >
                        <i className={`evidence-dot evidence-dot--${item.evidence}`} aria-hidden="true" />
                        {item.name}
                        {item.required ? <small>Required</small> : <small>Optional</small>}
                      </button>
                    ))}
                </div>
              ))}
            </div>

            <article className="equipment-card">
              <div className="equipment-card-topline">
                <span>{selectedItem.group}</span>
                <span>{selectedItem.required ? "Required component" : "Optional concept"}</span>
              </div>
              <h3>{selectedItem.name}</h3>
              <span className={`evidence-badge evidence-badge--${selectedItem.evidence}`}>
                {evidenceLabels[selectedItem.evidence]}
              </span>
              <p className="equipment-summary">{selectedItem.summary}</p>
              <dl className="equipment-facts">
                <div><dt>Problem addressed</dt><dd>{selectedItem.problem}</dd></div>
                <div><dt>What evidence supports</dt><dd>{selectedItem.support}</dd></div>
                <div><dt>Drawbacks</dt><dd>{selectedItem.drawbacks}</dd></div>
                <div><dt>Integration requirement</dt><dd>{selectedItem.integration}</dd></div>
              </dl>
              <details>
                <summary>Candidate materials and qualification</summary>
                <div className="material-list">
                  {selectedItem.materials.map((material) => (
                    <div key={material.name}>
                      <strong>{material.name}</strong>
                      <p>{material.role}</p>
                      <small>{material.qualification}</small>
                    </div>
                  ))}
                </div>
              </details>
              {selectedSources.length > 0 ? (
                <div className="equipment-sources">
                  <span>Primary sources</span>
                  {selectedSources.map((source) => (
                    <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                      {source.organization} · {source.title}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="source-empty">Original proposal; no component-specific performance evidence is claimed.</p>
              )}
            </article>
          </aside>
        </div>
      </section>

      <section
        className="surface-section mission-compatibility"
        id="surface-compatibility"
        aria-labelledby="compatibility-title"
      >
        <div className="surface-section-heading">
          <div>
            <p className="surface-kicker">Mission configurator</p>
            <h2 id="compatibility-title">A transparent rules check—not a safety score.</h2>
          </div>
          <p>
            The rules expose their assumptions. “Required items present” does not
            mean safe, certified, integrated, or flight ready.
          </p>
        </div>

        <div className="mission-config-grid">
          <div className="mission-fields">
            <label className="surface-field">
              <span>Environment</span>
              <select
                value={config.mission}
                onChange={(event) => updateConfig((current) => ({ ...current, mission: event.currentTarget.value as MissionId }))}
              >
                {Object.entries(missionLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="surface-field">
              <span>Terrain</span>
              <select
                value={config.terrain}
                onChange={(event) => updateConfig((current) => ({ ...current, terrain: event.currentTarget.value as StudioConfiguration["terrain"] }))}
              >
                <option value="level">Prepared / level</option>
                <option value="rocky">Rocky and irregular</option>
                <option value="slope">Sloped terrain</option>
                <option value="dusty">High dust exposure</option>
              </select>
            </label>
            <label className="surface-field">
              <span>Primary task</span>
              <select
                value={config.task}
                onChange={(event) => updateConfig((current) => ({ ...current, task: event.currentTarget.value as StudioConfiguration["task"] }))}
              >
                <option value="survey">Survey / traverse</option>
                <option value="geology">Geology sampling</option>
                <option value="construction">Assembly / construction</option>
                <option value="mobility">Mobility research</option>
              </select>
            </label>
            <label className="surface-field">
              <span>Lighting</span>
              <select
                value={config.lighting}
                onChange={(event) => updateConfig((current) => ({ ...current, lighting: event.currentTarget.value as StudioConfiguration["lighting"] }))}
              >
                <option value="sun">Direct sunlight</option>
                <option value="shade">Predominantly shade</option>
                <option value="mixed">Sun / shade transitions</option>
              </select>
            </label>
            <label className="surface-field">
              <span>Accessory battery assumption · Wh</span>
              <input
                type="number"
                min={0}
                max={2000}
                step={10}
                value={config.accessoryBatteryWh}
                onChange={(event) => updateConfig((current) => ({ ...current, accessoryBatteryWh: event.currentTarget.valueAsNumber }))}
              />
            </label>
          </div>

          <div className="compatibility-results">
            <div className={`compatibility-status compatibility-status--${compatibility.status}`}>
              <span>Compatibility language</span>
              <strong>{compatibility.label}</strong>
              <p>Complete-system safety and qualification are outside this educational configurator.</p>
            </div>
            <div className="mission-metrics">
              <div><span>Combined mass</span><strong>{formatNumber(compatibility.combinedMassKg)} kg</strong><small>Mass does not change with gravity</small></div>
              <div><span>Local weight</span><strong>{formatNumber(compatibility.weightN, 0)} N</strong><small>W = m × {compatibility.gravityMps2.toFixed(2)} m/s²</small></div>
              <div><span>Equipment mass</span><strong>{formatNumber(compatibility.equipmentMassKg)} kg</strong><small>Concept assumption + selected modules</small></div>
              <div><span>Accessory runtime</span><strong>{compatibility.accessoryRuntimeH === null ? "No powered add-ons" : `${formatNumber(compatibility.accessoryRuntimeH)} h`}</strong><small>85% usable Wh ÷ {formatNumber(compatibility.accessoryPowerW)} W; excludes life support</small></div>
            </div>
            <div className="rule-results">
              {compatibility.missingRequirements.length > 0 ? (
                <div><h3>Missing requirements</h3><ul>{compatibility.missingRequirements.map((item) => <li key={item}>{item}</li>)}</ul></div>
              ) : (
                <div><h3>Required-item check</h3><p>All required items represented by this concept are present. Integration and performance remain unverified.</p></div>
              )}
              {compatibility.conflicts.length > 0 ? (
                <div><h3>Unresolved conflicts</h3><ul>{compatibility.conflicts.map((item) => <li key={item}>{item}</li>)}</ul></div>
              ) : null}
              <div><h3>Rule-based suggestions</h3>{compatibility.suggestions.length ? <ul>{compatibility.suggestions.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No additional rule was triggered by this combination.</p>}</div>
            </div>
          </div>
        </div>

        <details className="assumption-register">
          <summary>Show mass, power, and garment-class assumptions</summary>
          <div>
            <table>
              <thead><tr><th>Assumption</th><th>Mass</th><th>Electrical load</th></tr></thead>
              <tbody>
                <tr><td>{concept.name} base equipment concept</td><td>{concept.equipmentMassKg} kg</td><td>Life-support power not modeled</td></tr>
                <tr><td>{config.bodyPreset} wearer preset</td><td>{bodyMassKg[config.bodyPreset]} kg</td><td>—</td></tr>
                {Object.entries(accessoryAssumptions).map(([id, value]) => (
                  <tr key={id}><td>{id.replace(/([A-Z])/g, " $1")}</td><td>{value.massKg} kg</td><td>{value.powerW} W</td></tr>
                ))}
              </tbody>
            </table>
            <div className="garment-boundaries">
              <article><strong>Habitat clothing</strong><p>Comfort, hygiene, thermal comfort, and identity inside a controlled atmosphere. No vacuum protection.</p></article>
              <article><strong>Launch / entry garment</strong><p>Vehicle-compatible contingency protection. Not automatically suitable for surface EVA.</p></article>
              <article><strong>Surface EVA equipment</strong><p>Pressure, life support, thermal, mobility, abrasion, communications, and mission interfaces must work as one qualified system.</p></article>
            </div>
          </div>
        </details>
      </section>

      <section
        className="surface-section research-section"
        id="surface-research"
        aria-labelledby="research-title"
      >
        <div className="surface-section-heading">
          <div>
            <p className="surface-kicker">Research-informed concepts</p>
            <h2 id="research-title">The evidence ladder stays attached.</h2>
          </div>
          <p>
            Sources were checked on 30 September 2026. Primary-source statements
            are paraphrased; a component’s heritage does not make this complete suit operational.
          </p>
        </div>

        <div className="evidence-ladder">
          <article>
            <span className="evidence-badge evidence-badge--operational-heritage">Operational heritage</span>
            <h3>Pressure, restraint, cooling, thermal layers, PLSS, communications.</h3>
            <p>Established functions and architectures inform the baseline. Exact materials, dimensions, and interfaces still require mission qualification.</p>
          </article>
          <article>
            <span className="evidence-badge evidence-badge--demonstrated-research">Demonstrated research</span>
            <h3>Knitted MCP sleeve, lunar dust shield, next-generation LCVG, loading garment.</h3>
            <p>The demonstrations occurred in different contexts: a lab sleeve, rigid lunar samples, development hardware, and an IVA loading garment. They have not been proven as one suit.</p>
          </article>
          <article>
            <span className="evidence-badge evidence-badge--original-concept">Original speculative integration</span>
            <h3>Cat-ear pods, staff, assistive module, flexible gaiter electrodes, haptics.</h3>
            <p>Visible proposals with explicit failure questions. Their value remains a hypothesis until analysis and representative testing support it.</p>
          </article>
        </div>

        <div className="research-spotlights" aria-label="Research maturity notes">
          <details open>
            <summary>2026 liquid-cooling garment development</summary>
            <p>
              Axiom Space’s 7 June 2026 release describes Prada contributions to
              engineered knitting, modelling, and fibre sourcing for an AxEMU
              liquid-cooling and ventilation garment. It is development hardware,
              not evidence that this exhibition suit is flight certified.
            </p>
            <a href="https://www.axiomspace.com/release/axiom-space-prada-unveil-inner-layer-of-next-gen-lunar-spacesuit" target="_blank" rel="noreferrer">Primary company release</a>
          </details>
          <details>
            <summary>MIT 3D-knit mechanical-counter-pressure sleeve</summary>
            <p>
              The reported prototype is an arm sleeve, not a full vacuum suit.
              The associated research reported roughly 4–8 kPa on the sleeve while
              discussing more than 20 kPa for full MCP and a 24 kPa target; vacuum
              testing and full-body development remained future work.
            </p>
            <a href="https://selfassemblylab.mit.edu/3d-knit-biosuit" target="_blank" rel="noreferrer">MIT project page</a>
          </details>
          <details>
            <summary>Electrodynamic dust shield on the Moon</summary>
            <p>
              NASA reported regolith removal from glass and radiator samples during
              Blue Ghost Mission 1 in March 2025. NASA’s 2026 catalog separates
              flat-surface EDS at TRL 7 from bendable EDS at TRL 5. Neither result
              validates a flexible, worn suit module.
            </p>
            <a href="https://www.nasa.gov/image-article/nasas-dust-shield-successfully-repels-lunar-regolith-on-moon/" target="_blank" rel="noreferrer">NASA lunar result</a>
          </details>
          <details>
            <summary>Gravity-loading garment boundary</summary>
            <p>
              MIT’s Gravity Loading Countermeasure Skinsuit is an intravehicular
              compression/loading research garment with technology demonstrations,
              including ISS and Ax-2 contexts. It is not pressure containment,
              surface armor, or proof of powered terrain assistance.
            </p>
            <a href="https://www.media.mit.edu/projects/gravity-loading-countermeasure-skinsuit/overview/" target="_blank" rel="noreferrer">MIT GLCS overview</a>
          </details>
        </div>

        <div className="research-cautions">
          <article><strong>UV ≠ ionizing radiation</strong><p>Visor filters and reflective finishes can address optical/UV exposure and thermal balance. They do not provide complete protection from galactic cosmic rays or major solar-particle events.</p></article>
          <article><strong>Low gravity ≠ low inertia</strong><p>A suited person weighs less on the Moon, but the same mass still resists acceleration. Internal actuators redistribute work; they do not create unlimited external ground force.</p></article>
          <article><strong>Mars ≠ shirt-sleeve environment</strong><p>A Mars concept still needs pressure protection, life support, thermal control, dust management, and an emergency strategy.</p></article>
        </div>

        <div className="reference-register">
          {references.map((reference) => (
            <article key={reference.id}>
              <span>{reference.organization}</span>
              <h3><a href={reference.url} target="_blank" rel="noreferrer">{reference.title}</a></h3>
              <p>{reference.note}</p>
              <small>{reference.publicationDate} · Verified {reference.verifiedDate}</small>
            </article>
          ))}
        </div>
      </section>

      <footer className="surface-footer">
        <strong>RIEVA//STRA · SURFACE STUDIO</strong>
        <p>Independent educational exhibition · No store · No safety certification · Configuration stays on your device</p>
      </footer>
    </div>
  );
}
