"use client";

import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  blackHolePresets,
  blackHoleReferences,
  defaultBlackHoleConfiguration,
  verificationDate,
  type BlackHolePreset,
} from "../../lib/black-hole/catalog";
import {
  assessOrbit,
  gravitationalRadiusKm,
  kerrRadii,
  probeDefinitions,
  radiusRgToKm,
  type OrbitDirection,
  type ProbeKind,
} from "../../lib/black-hole/model";
import styles from "./BlackHoleLab.module.css";

const BlackHoleScene = lazy(() =>
  import("./BlackHoleScene").then((module) => ({
    default: module.BlackHoleScene,
  })),
);

export interface BlackHoleLabProps {
  active?: boolean;
}

class BlackHoleSceneBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Black Hole Laboratory 3D scene failed", error, info.componentStack);
  }

  componentDidUpdate(previous: { children: ReactNode; resetKey: string }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className={styles.sceneLoading} role="alert">
          The 3D scene stopped unexpectedly. Change an experiment setting to retry;
          the calculated boundaries and physics notebook remain available.
        </div>
      );
    }
    return this.props.children;
  }
}

function formatMass(value: number) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} billion M☉`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(3)} million M☉`;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} M☉`;
}

function formatDistanceKm(value: number) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} billion km`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} million km`;
  if (value >= 1_000) return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} km`;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} km`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Not defined here";
  if (seconds >= 86_400) return `${(seconds / 86_400).toFixed(2)} days`;
  if (seconds >= 3_600) return `${(seconds / 3_600).toFixed(2)} h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(2)} min`;
  return `${seconds.toFixed(3)} s`;
}

function formatAcceleration(value: number | null) {
  if (value === null) return "Not applicable";
  if (value === 0) return "0 m/s²";
  if (value >= 0.01 && value < 10_000) {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 3 })} m/s²`;
  }
  return `${value.toExponential(3)} m/s²`;
}

function markerPosition(radius: number, scaleMaximum: number) {
  return `${Math.min(98, Math.max(2, (radius / scaleMaximum) * 100))}%`;
}

function ScienceEquation({
  number,
  domain,
  title,
  formula,
  children,
}: {
  number: string;
  domain: string;
  title: string;
  formula: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="bh-equation-card">
      <div className="bh-equation-meta">
        <span>{domain}</span>
        <span aria-label={`Equation ${number}`}>EQ · {number}</span>
      </div>
      <h3>{title}</h3>
      <div className="bh-equation" role="math">
        {formula}
      </div>
      <p>{children}</p>
    </article>
  );
}

export function BlackHoleLab({ active = false }: BlackHoleLabProps) {
  const [presetId, setPresetId] = useState<BlackHolePreset["id"]>(
    defaultBlackHoleConfiguration.presetId,
  );
  const [massSolar, setMassSolar] = useState(defaultBlackHoleConfiguration.massSolar);
  const [spin, setSpin] = useState(defaultBlackHoleConfiguration.spin);
  const [radiusRg, setRadiusRg] = useState(defaultBlackHoleConfiguration.radiusRg);
  const [direction, setDirection] = useState<OrbitDirection>(
    defaultBlackHoleConfiguration.direction,
  );
  const [probeKind, setProbeKind] = useState<ProbeKind>(
    defaultBlackHoleConfiguration.probeKind,
  );
  const [speed, setSpeed] = useState(defaultBlackHoleConfiguration.speed);
  const [playing, setPlaying] = useState(false);
  const [sceneActivated, setSceneActivated] = useState(active);
  const motionInitializedRef = useRef(false);

  useEffect(() => {
    if (!active || sceneActivated) return;
    const timer = window.setTimeout(() => setSceneActivated(true), 0);
    return () => window.clearTimeout(timer);
  }, [active, sceneActivated]);

  useEffect(() => {
    if (!active || motionInitializedRef.current) return;
    motionInitializedRef.current = true;
    const timer = window.setTimeout(() => {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setPlaying(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active]);

  const selectedPreset =
    blackHolePresets.find((preset) => preset.id === presetId) ??
    blackHolePresets[1];
  const radii = useMemo(() => kerrRadii(spin), [spin]);
  const assessment = useMemo(
    () => assessOrbit({ massSolar, spin, radiusRg, direction, probeKind }),
    [massSolar, spin, radiusRg, direction, probeKind],
  );
  const rgKm = gravitationalRadiusKm(massSolar);
  const scaleMaximum = Math.max(12, radiusRg * 1.08, assessment.selectedIscoRg * 1.12);
  const customPreset =
    massSolar !== selectedPreset.massSolar || spin !== selectedPreset.illustrativeSpin;

  const choosePreset = (preset: BlackHolePreset) => {
    setPresetId(preset.id);
    setMassSolar(preset.massSolar);
    setSpin(preset.illustrativeSpin);
    setRadiusRg(preset.id === "stellar" ? 8 : 7);
    setDirection("prograde");
    setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  const reset = () => {
    setPresetId(defaultBlackHoleConfiguration.presetId);
    setMassSolar(defaultBlackHoleConfiguration.massSolar);
    setSpin(defaultBlackHoleConfiguration.spin);
    setRadiusRg(defaultBlackHoleConfiguration.radiusRg);
    setDirection(defaultBlackHoleConfiguration.direction);
    setProbeKind(defaultBlackHoleConfiguration.probeKind);
    setSpeed(defaultBlackHoleConfiguration.speed);
    setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  const selectedBoundaryRows = [
    {
      id: "horizon",
      label: "Outer horizon",
      value: radii.horizonRg,
      className: styles.boundaryHorizon,
    },
    {
      id: "static-limit",
      label: "Equatorial static limit",
      value: radii.staticLimitEquatorRg,
      className: styles.boundaryErgo,
    },
    {
      id: "photon",
      label: `${direction === "prograde" ? "Prograde" : "Retrograde"} photon orbit`,
      value: assessment.selectedPhotonRg,
      className: styles.boundaryPhoton,
    },
    {
      id: "isco",
      label: `${direction === "prograde" ? "Prograde" : "Retrograde"} ISCO`,
      value: assessment.selectedIscoRg,
      className: styles.boundaryIsco,
    },
    {
      id: "probe",
      label: "Selected coordinate radius",
      value: radiusRg,
      className: styles.boundaryProbe,
    },
  ];

  return (
    <main className={styles.lab}>
      <section className={styles.hero} aria-labelledby="black-hole-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Black Hole Laboratory · Kerr spacetime</p>
          <h1 id="black-hole-title">
            Approach the boundary.
            <span>Keep the physics visible.</span>
          </h1>
          <p className={styles.heroLead}>
            Explore how mass, spin, and orbit direction move the important
            boundaries around an ideal rotating black hole. Launch a test marker,
            examine why a circular path survives or fails, and keep observation,
            calculation, and visual metaphor separate.
          </p>
          <div className={styles.heroBadges} aria-label="Model scope">
            <span>Exact Kerr boundary formulae</span>
            <span>Rule-based orbit diagnosis</span>
            <span>No invented survival probability</span>
          </div>
        </div>
        <div className={styles.heroGlyph} aria-hidden="true">
          <div className={styles.heroBlackHole} />
          <i className={styles.heroOrbitOne} />
          <i className={styles.heroOrbitTwo} />
          <span>KERR</span>
        </div>
      </section>

      <section className={styles.presetStrip} aria-labelledby="preset-title">
        <div>
          <p className={styles.eyebrow}>Choose a scale</p>
          <h2 id="preset-title">Three masses. Radically different tides.</h2>
        </div>
        <div className={styles.presetButtons}>
          {blackHolePresets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              aria-pressed={preset.id === presetId}
              onClick={() => choosePreset(preset)}
            >
              <strong>{preset.shortName}</strong>
              <span>{preset.id === "stellar" ? "Scale study" : "Observed mass"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.laboratory} aria-labelledby="lab-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Interactive experiment</p>
            <h2 id="lab-title">Place a test object in the equatorial plane.</h2>
          </div>
          <p>
            Boyer–Lindquist radii are coordinates, not ruler distances. The 3D
            surfaces preserve their ordering and spin dependence, but the bright
            disk, jets, and camera view are an explanatory scene—not a telescope
            image or a general-relativistic ray trace.
          </p>
        </div>

        <div className={styles.labGrid}>
          <div className={styles.visualColumn}>
            <div className={styles.sceneFrame}>
              {sceneActivated ? (
                <BlackHoleSceneBoundary
                  resetKey={`${spin}:${radiusRg}:${direction}:${probeKind}`}
                >
                  <Suspense
                    fallback={
                      <div className={styles.sceneLoading} role="status">
                        <span />
                        Constructing Kerr coordinate surfaces…
                      </div>
                    }
                  >
                    <BlackHoleScene
                      active={active}
                      spin={spin}
                      radiusRg={radiusRg}
                      direction={direction}
                      probeKind={probeKind}
                      animationMode={assessment.animationMode}
                      playing={playing}
                      speed={speed}
                    />
                  </Suspense>
                </BlackHoleSceneBoundary>
              ) : (
                <div className={styles.sceneLoading} role="status">
                  Open the Black Hole Laboratory to initialize its 3D scene.
                </div>
              )}
            </div>

            <div className={styles.transportBar} aria-label="Animation controls">
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => setPlaying((current) => !current)}
              >
                <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
                {playing ? "Pause motion" : "Play motion"}
              </button>
              <label>
                Motion speed
                <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                  <option value={4}>4×</option>
                </select>
              </label>
              <button type="button" onClick={reset}>Reset experiment</button>
              <span className={styles.motionLabel}>Motion is illustrative, not a geodesic integration.</span>
            </div>
          </div>

          <aside className={styles.controls} aria-label="Black hole experiment controls">
            <div className={styles.controlHeading}>
              <span>01</span>
              <div>
                <strong>{selectedPreset.name}</strong>
                <small>{customPreset ? "Preset customized" : "Preset values"}</small>
              </div>
            </div>

            <label className={styles.field}>
              <span>
                Mass <output>{formatMass(massSolar)}</output>
              </span>
              <input
                type="number"
                min={0.1}
                max={1e11}
                step="any"
                value={massSolar}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) setMassSolar(Math.min(1e11, Math.max(0.1, value)));
                }}
                aria-describedby="mass-help"
              />
              <small id="mass-help">Solar masses; size scales linearly with mass.</small>
            </label>

            <label className={styles.field}>
              <span>
                Dimensionless spin a* <output>{spin.toFixed(3)}</output>
              </span>
              <input
                type="range"
                min={0}
                max={0.999}
                step={0.001}
                value={spin}
                onChange={(event) => setSpin(Number(event.target.value))}
              />
              <small>0 is nonrotating; 1 is the ideal extremal limit. Preset spins are illustrative.</small>
            </label>

            <fieldset className={styles.segmentedField}>
              <legend>Orbit direction</legend>
              <div>
                {(["prograde", "retrograde"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={direction === value}
                    onClick={() => setDirection(value)}
                  >
                    {value === "prograde" ? "With spin" : "Against spin"}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className={styles.field}>
              <span>
                Coordinate radius <output>{radiusRg.toFixed(2)} r_g</output>
              </span>
              <input
                type="range"
                min={0.8}
                max={16}
                step={0.02}
                value={radiusRg}
                onChange={(event) => setRadiusRg(Number(event.target.value))}
              />
              <small>{formatDistanceKm(radiusRgToKm(radiusRg, massSolar))} from the coordinate origin.</small>
            </label>

            <div className={styles.boundaryJumps} aria-label="Jump to a calculated boundary">
              <span>Place at</span>
              <button type="button" onClick={() => setRadiusRg(radii.horizonRg)}>Horizon</button>
              <button type="button" onClick={() => setRadiusRg(assessment.selectedPhotonRg)}>Photon orbit</button>
              <button type="button" onClick={() => setRadiusRg(assessment.selectedIscoRg)}>ISCO</button>
            </div>

            <fieldset className={styles.probeField}>
              <legend>Test object</legend>
              <div>
                {(Object.keys(probeDefinitions) as ProbeKind[]).map((kind) => (
                  <button
                    type="button"
                    key={kind}
                    aria-pressed={probeKind === kind}
                    onClick={() => setProbeKind(kind)}
                  >
                    <span aria-hidden="true" className={`${styles.probeIcon} ${styles[`probeIcon${kind[0].toUpperCase()}${kind.slice(1)}`]}`} />
                    <strong>{probeDefinitions[kind].name}</strong>
                  </button>
                ))}
              </div>
              <small>{probeDefinitions[probeKind].description}</small>
            </fieldset>

            <div className={styles.presetNote}>
              <strong>About this preset</strong>
              <p>{selectedPreset.note}</p>
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.diagnosis} aria-labelledby="diagnosis-title">
        <div className={`${styles.outcomePanel} ${styles[`tone${assessment.tone[0].toUpperCase()}${assessment.tone.slice(1)}`]}`}>
          <div className={styles.outcomeHeader}>
            <div>
              <p className={styles.eyebrow}>Current diagnosis</p>
              <h2 id="diagnosis-title">{assessment.title}</h2>
            </div>
            <span>{assessment.regime.replaceAll("-", " ")}</span>
          </div>
          <p>{assessment.summary}</p>
          <div className={styles.outcomeMetrics}>
            <div>
              <span>Coordinate-r scale</span>
              <strong>{formatDistanceKm(radiusRgToKm(radiusRg, massSolar))}</strong>
            </div>
            <div>
              <span>Coordinate period at infinity</span>
              <strong>{formatDuration(assessment.orbitalPeriodSeconds)}</strong>
            </div>
            <div>
              <span>Approx. tidal difference</span>
              <strong>{formatAcceleration(assessment.tidalDifferentialMps2)}</strong>
            </div>
          </div>
          <p className={styles.tidalNote}>{assessment.tidalNote}</p>
        </div>

        <div className={styles.radialPanel}>
          <div className={styles.radialHeader}>
            <div>
              <p className={styles.eyebrow}>Radial anatomy</p>
              <h2>Where the selected path sits.</h2>
            </div>
            <span>Scale ends at {scaleMaximum.toFixed(1)} r_g</span>
          </div>
          <div className={styles.boundaryRows}>
            {selectedBoundaryRows.map((row) => (
              <div className={styles.boundaryRow} key={row.id}>
                <div>
                  <span>{row.label}</span>
                  <strong>{row.value.toFixed(3)} r_g</strong>
                </div>
                <div className={styles.boundaryTrack}>
                  <i
                    className={row.className}
                    style={{ left: markerPosition(row.value, scaleMaximum) } as CSSProperties}
                  />
                </div>
              </div>
            ))}
          </div>
          <p>
            At the equator, the static limit remains at 2 r_g while the horizon
            contracts in this coordinate as spin rises. Inside the ergosphere, a
            stationary observer cannot remain fixed relative to infinity; that is
            not the same as having crossed the horizon.
          </p>
        </div>
      </section>

      <section className={styles.physics} id="black-hole-physics" aria-labelledby="black-hole-physics-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Model notebook</p>
            <h2 id="black-hole-physics-title">What is calculated—and what is staged.</h2>
          </div>
          <p>
            The equations use SI units for physical distances and geometric units
            for the dimensionless radial display. Charge is set to zero, the
            spacetime is stationary, and the test object does not alter it.
          </p>
        </div>
        <div className={`${styles.equationGrid} bh-equation-grid`}>
          <ScienceEquation
            number="01"
            domain="Length scale"
            title="Gravitational radius"
            formula={
              <math display="block" aria-label="gravitational radius equals G times mass divided by the speed of light squared">
                <mrow>
                  <msub><mi>r</mi><mi>g</mi></msub><mo>=</mo>
                  <mfrac><mrow><mi>G</mi><mi>M</mi></mrow><msup><mi>c</mi><mn>2</mn></msup></mfrac>
                </mrow>
              </math>
            }
          >
            One <i>r</i><sub>g</sub> is {rgKm.toLocaleString("en-US", { maximumFractionDigits: 3 })} km for the current mass.
            Mass changes the physical scale; spin sets the dimensionless boundary positions.
          </ScienceEquation>
          <ScienceEquation
            number="02"
            domain="Causal boundary"
            title="Outer event horizon"
            formula={
              <math display="block" aria-label="outer horizon radius equals gravitational radius times one plus the square root of one minus dimensionless spin squared">
                <mrow>
                  <msub><mi>r</mi><mo>+</mo></msub><mo>=</mo>
                  <msub><mi>r</mi><mi>g</mi></msub>
                  <mrow><mo>(</mo><mn>1</mn><mo>+</mo><msqrt><mrow><mn>1</mn><mo>−</mo><msubsup><mi>a</mi><mo>*</mo><mn>2</mn></msubsup></mrow></msqrt><mo>)</mo></mrow>
                </mrow>
              </math>
            }
          >
            The horizon is a causal boundary, not a material sphere. The scene
            renders its Boyer–Lindquist coordinate location.
          </ScienceEquation>
          <ScienceEquation
            number="03"
            domain="Frame dragging"
            title="Outer static limit"
            formula={
              <math display="block" aria-label="static limit radius as a function of polar angle equals gravitational radius times one plus the square root of one minus spin squared times cosine squared theta">
                <mrow>
                  <msub><mi>r</mi><mi>e</mi></msub><mo>(</mo><mi>θ</mi><mo>)</mo><mo>=</mo>
                  <msub><mi>r</mi><mi>g</mi></msub>
                  <mrow><mo>(</mo><mn>1</mn><mo>+</mo><msqrt><mrow><mn>1</mn><mo>−</mo><msubsup><mi>a</mi><mo>*</mo><mn>2</mn></msubsup><msup><mi>cos</mi><mn>2</mn></msup><mi>θ</mi></mrow></msqrt><mo>)</mo></mrow>
                </mrow>
              </math>
            }
          >
            The ergosphere lies between this surface and the horizon. A stationary
            worldline relative to infinity cannot remain there.
          </ScienceEquation>
          <ScienceEquation
            number="04"
            domain="Circular geodesics"
            title="Equatorial ISCO radius"
            formula={
              <div className="bh-equation-system" aria-label="ISCO radius over gravitational radius equals three plus Z two, minus or plus the square root of the product of three minus Z one and three plus Z one plus two Z two">
                <math display="block">
                  <mrow>
                    <mfrac><msub><mi>r</mi><mrow><mi>I</mi><mi>S</mi><mi>C</mi><mi>O</mi></mrow></msub><msub><mi>r</mi><mi>g</mi></msub></mfrac>
                    <mo>=</mo><mn>3</mn><mo>+</mo><msub><mi>Z</mi><mn>2</mn></msub><mo>∓</mo>
                    <msqrt><mrow><mo>(</mo><mn>3</mn><mo>−</mo><msub><mi>Z</mi><mn>1</mn></msub><mo>)</mo><mo>(</mo><mn>3</mn><mo>+</mo><msub><mi>Z</mi><mn>1</mn></msub><mo>+</mo><mn>2</mn><msub><mi>Z</mi><mn>2</mn></msub><mo>)</mo></mrow></msqrt>
                  </mrow>
                </math>
                <span>upper sign: prograde · lower sign: retrograde</span>
              </div>
            }
          >
            The exact standard Kerr expression is evaluated with its Z terms in
            code. The ISCO bounds stable equatorial circular geodesics; the photon
            orbit is circular but unstable.
          </ScienceEquation>
          <ScienceEquation
            number="05"
            domain="Local diagnostic"
            title="Approximate tidal scale"
            formula={
              <math display="block" aria-label="tidal acceleration difference is approximately two G M times object length divided by radius cubed">
                <mrow>
                  <mi>Δ</mi><mi>a</mi><mo>≈</mo>
                  <mfrac><mrow><mn>2</mn><mi>G</mi><mi>M</mi><mi>L</mi></mrow><msup><mi>r</mi><mn>3</mn></msup></mfrac>
                </mrow>
              </math>
            }
          >
            This Newtonian gradient compares scale across length <i>L</i>. The 1 g,
            10 g, and 1000 g bands are references—not human or hardware
            qualification limits.
          </ScienceEquation>
          <ScienceEquation
            number="06"
            domain="Render boundary"
            title="Accretion and jets"
            formula={
              <div className="bh-equation-statement" aria-label="illustrative context is not a trajectory solution">
                <span>illustrative context</span><b aria-hidden="true">≠</b><span>trajectory solution</span>
              </div>
            }
          >
            Disk flow, plasma emission, magnetic fields, radiative transfer,
            lensing, and jet launching are not solved. Their geometry supplies
            context only.
          </ScienceEquation>
        </div>
        <div className={styles.limitations}>
          <strong>Not modeled</strong>
          <span>Spacecraft thrust or structural response</span>
          <span>Inclined or eccentric Kerr geodesics</span>
          <span>Time dilation for a finite observer</span>
          <span>Ray-traced gravitational lensing</span>
          <span>Magnetohydrodynamic accretion</span>
          <span>Inside-horizon visualization</span>
        </div>
        <aside className={styles.researchFrontier}>
          <span>2024 research frontier</span>
          <div>
            <h3>Magnetic structure is becoming observable.</h3>
            <p>
              EHT polarization measurements revealed strong, organized magnetic
              structure in the emitting plasma around Sagittarius A*, similar in
              broad form to M87*. That informs models of accretion and possible jet
              launching; it does not prove a visible Sgr A* jet, determine the spin
              used here, or validate this scene’s decorative plasma.
            </p>
          </div>
        </aside>
      </section>

      <section className={styles.references} id="black-hole-research" aria-labelledby="black-hole-references-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Research notes</p>
            <h2 id="black-hole-references-title">Authoritative sources, with boundaries.</h2>
          </div>
          <p>
            Publication dates are recorded below. Links and claims were verified on
            {` ${verificationDate}`}. A source supporting one mass measurement does
            not validate the lab’s illustrative spin or plasma artwork.
          </p>
        </div>
        <div className={styles.referenceList}>
          {blackHoleReferences.map((reference, index) => (
            <article key={reference.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <p>{reference.organization} · {reference.publicationDate}</p>
                <h3>{reference.title}</h3>
                <p>{reference.supports}</p>
                {reference.caveat ? <small>{reference.caveat}</small> : null}
              </div>
              <a href={reference.url} target="_blank" rel="noreferrer">
                Open source <span aria-hidden="true">↗</span>
              </a>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
