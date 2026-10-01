"use client";

type TechnologySettings = {
  powerKw: number;
  specificImpulseS: number;
  efficiencyPct: number;
  maxDurationDays?: number;
};

type TechnologyLadderProps = {
  onApply: (settings: TechnologySettings, label: string) => void;
};

const technologyScenarios: Array<{
  level: string;
  badge: string;
  title: string;
  summary: string;
  values: string;
  settings: TechnologySettings;
  caution: string;
}> = [
  {
    level: "Baseline",
    badge: "Study reference",
    title: "Conservative Hall envelope",
    summary:
      "A deliberately legible starting point for seeing how continuous low thrust changes a near-circular orbit.",
    values: "15 kW · 1,800 s · 65%",
    settings: {
      powerKw: 15,
      specificImpulseS: 1800,
      efficiencyPct: 65,
      maxDurationDays: 10,
    },
    caution: "A generic study point, not a named flight thruster.",
  },
  {
    level: "Applied technology",
    badge: "Ground-tested class",
    title: "High-power solar electric",
    summary:
      "A HERMeS/AEPS-inspired sensitivity case for exploring higher specific impulse and mature high-power Hall technology.",
    values: "12 kW · 2,800 s · 67%",
    settings: {
      powerKw: 12,
      specificImpulseS: 2800,
      efficiencyPct: 67,
      maxDurationDays: 16,
    },
    caution:
      "Representative inputs only; the simulator omits throttle maps, thermal limits and power processing.",
  },
  {
    level: "Research envelope",
    badge: "Hypothesis",
    title: "High-Isp stress test",
    summary:
      "An intentionally optimistic envelope for finding sensitivity and failure boundaries—not a qualified engine forecast.",
    values: "25 kW · 4,500 s · 72%",
    settings: {
      powerKw: 25,
      specificImpulseS: 4500,
      efficiencyPct: 72,
      maxDurationDays: 20,
    },
    caution:
      "Constant efficiency is least trustworthy here; lifetime, plume and thermal feasibility are outside the model.",
  },
];

export function TechnologyLadder({ onApply }: TechnologyLadderProps) {
  return (
    <section className="section-shell" id="technology" aria-labelledby="technology-title">
      <div className="section-heading">
        <p className="eyebrow">Technology ladder</p>
        <h2 id="technology-title">Test assumptions, not hype.</h2>
        <p>
          These scenarios change only parameters represented by this first-order model. They are sensitivity studies—not hardware qualification or performance promises.
        </p>
      </div>

      <div className="technology-grid">
        {technologyScenarios.map((scenario) => (
          <article className="technology-card" key={scenario.level}>
            <div className="technology-card-topline">
              <span className="mono-label">{scenario.level}</span>
              <span className="status-chip">{scenario.badge}</span>
            </div>
            <h3>{scenario.title}</h3>
            <p>{scenario.summary}</p>
            <p className="technology-values">{scenario.values}</p>
            <p className="technology-caution">{scenario.caution}</p>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => onApply(scenario.settings, scenario.title)}
            >
              Apply to mission
            </button>
          </article>
        ))}
      </div>

      <div className="frontier-grid">
        <article>
          <span className="mono-label">Flight research</span>
          <h3>Iodine electric propulsion</h3>
          <p>
            A 2021 in-space demonstration showed solid iodine can replace xenon in a compact ion system. This model can represent its thrust, power and Isp—but not storage chemistry, corrosion, plasma behavior or plume interactions.
          </p>
          <a
            href="https://www.nature.com/articles/s41586-021-04015-y"
            target="_blank"
            rel="noreferrer"
          >
            Nature primary paper ↗
          </a>
        </article>
        <article>
          <span className="mono-label">Model boundary</span>
          <h3>Atmosphere-breathing propulsion</h3>
          <p>
            This active research direction could extend very-low Earth orbit missions, but applying it here would be misleading: the current model has no atmosphere or drag. It belongs in a future force-model upgrade.
          </p>
          <a
            href="https://www.esa.int/Enabling_Support/Preparing_for_the_Future/Discovery_and_Preparation/ESA_boosts_efforts_to_launch_missions_into_Very_Low_Earth_Orbits"
            target="_blank"
            rel="noreferrer"
          >
            ESA research overview ↗
          </a>
        </article>
      </div>
    </section>
  );
}

const validations = [
  {
    check: "24 h circular-orbit radial drift",
    measured: "6.912 × 10⁻³ m",
    acceptance: "< 1 m",
  },
  {
    check: "Relative specific-energy error",
    measured: "5.081 × 10⁻¹⁰",
    acceptance: "< 1 × 10⁻⁹",
  },
  {
    check: "Relative angular-momentum error",
    measured: "2.541 × 10⁻¹⁰",
    acceptance: "< 1 × 10⁻⁹",
  },
  {
    check: "Analytical propellant-use error",
    measured: "4.06 × 10⁻¹² kg",
    acceptance: "< 1 × 10⁻⁹ kg",
  },
  {
    check: "Timestep convergence",
    measured: "Order 4.55 · ratio 23.4×",
    acceptance: "> 3.5 · > 8×",
  },
  {
    check: "Interruption thrust leakage",
    measured: "0 N",
    acceptance: "Exactly 0 N",
  },
];

export function PhysicsAndValidation() {
  return (
    <>
      <section className="section-shell physics-section" id="physics" aria-labelledby="physics-title">
        <div className="section-heading">
          <p className="eyebrow">About the model</p>
          <h2 id="physics-title">Understand every force in the loop.</h2>
          <p>
            Rievastra is an educational mission study: transparent enough to inspect, limited enough to validate.
          </p>
        </div>

        <div className="physics-layout">
          <div className="equation-stack" aria-label="Governing equations">
            <div className="equation-row">
              <span className="equation">r̈ = −μr / |r|³ + (T/m) ûᵥ</span>
              <p>Two-body gravity plus thrust acceleration in the instantaneous prograde direction.</p>
            </div>
            <div className="equation-row">
              <span className="equation">vₑ = Iₛₚ g₀</span>
              <p>
                Exhaust velocity uses the exact standard reference acceleration
                g₀ = 9.80665 m/s² that defines specific impulse—not the selected
                world’s local surface gravity.
              </p>
            </div>
            <div className="equation-row">
              <span className="equation">T = 2ηP / vₑ</span>
              <p>Idealized electric-propulsion thrust from power and constant efficiency.</p>
            </div>
            <div className="equation-row">
              <span className="equation">ṁ = −T / vₑ</span>
              <p>Propellant mass flow while the engine is commanded on.</p>
            </div>
          </div>

          <div className="model-notes">
            <div>
              <span className="mono-label">Numerics</span>
              <h3>Classical RK4</h3>
              <p>
                Fixed 20 s internal steps, split exactly at interruption, output and exhaustion boundaries. Telemetry is stored every 60 s. A Web Worker propagates both missions without blocking the interface.
              </p>
            </div>
            <div>
              <span className="mono-label">Target gate</span>
              <h3>|a − aₜ| ≤ 10 km and e ≤ 0.005</h3>
              <p>
                Both project-defined tolerances must be met. Crossing the target altitude alone is not circular-orbit insertion. Thrust cuts off when target semimajor axis is reached; the eccentricity test remains honest.
              </p>
            </div>
            <div>
              <span className="mono-label">Guidance</span>
              <h3>A rule, not an optimizer</h3>
              <p>
                The thrust vector follows velocity. No trajectory optimization, closed-loop navigation, steering loss, attitude dynamics or finite response is modeled.
              </p>
            </div>
          </div>
        </div>

        <div className="limitations-callout">
          <span className="mono-label">Known omissions</span>
          <p>
            Every selectable world is treated as an isolated sphere. The model omits atmosphere and drag, oblateness (including J₂), rings and moons, third-body gravity from the Sun or planets, eclipses, radiation, thermal limits, power degradation, throttle maps, plume interactions, attitude dynamics, and finite steering response. Giant-planet “altitude” is measured from a reference radius rather than solid ground.
          </p>
        </div>
      </section>

      <section className="section-shell" id="validation" aria-labelledby="validation-title">
        <div className="section-heading validation-heading">
          <div>
            <p className="eyebrow">Numerical validation</p>
            <h2 id="validation-title">Measured checks, not decorative confidence.</h2>
            <p>
              Results below were produced on 30 September 2026 by the bundled, independent standard-library Python suite—not copied from the browser engine. The conservation benchmark remains the Earth baseline; automated browser-model tests separately exercise the generalized lunar case.
            </p>
          </div>
          <span className="validation-pass">6 / 6 PASS</span>
        </div>

        <div className="validation-table-wrap">
          <table className="validation-table">
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col">Measured</th>
                <th scope="col">Acceptance</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {validations.map((row) => (
                <tr key={row.check}>
                  <th scope="row">{row.check}</th>
                  <td>{row.measured}</td>
                  <td>{row.acceptance}</td>
                  <td><span className="pass-label">✓ Pass</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="validation-footnote">
          Circular-orbit check: 400 km, 24 h, 10 s RK4 step. Convergence check: 40 → 20 → 10 s. The full report and thresholds are reproducible with <code>python3 scripts/validate.py</code>.
        </p>
      </section>

      <section className="section-shell references-section" id="references" aria-labelledby="references-title">
        <div className="section-heading">
          <p className="eyebrow">Primary references</p>
          <h2 id="references-title">Trace the assumptions.</h2>
        </div>
        <div className="reference-list">
          <a href="https://ocw.mit.edu/courses/16-346-astrodynamics-fall-2008/dbce406df8d13e052f9229880ed96c02_lec_02.pdf" target="_blank" rel="noreferrer">
            <span>MIT OCW 16.346</span>
            <strong>Basic two-body relations ↗</strong>
          </a>
          <a href="https://descanso.jpl.nasa.gov/SciTechBook/series4/Electric_Propulsion_2nd_edition.pdf" target="_blank" rel="noreferrer">
            <span>NASA/JPL</span>
            <strong>Fundamentals of Electric Propulsion ↗</strong>
          </a>
          <a href="https://ssd.jpl.nasa.gov/planets/phys_par.html" target="_blank" rel="noreferrer">
            <span>NASA/JPL SSD</span>
            <strong>Planetary physical parameters ↗</strong>
          </a>
          <a href="https://ntrs.nasa.gov/api/citations/20220007037/downloads/SP2022_438_CASSADY.pdf" target="_blank" rel="noreferrer">
            <span>NASA NTRS</span>
            <strong>HERMeS / AEPS performance ↗</strong>
          </a>
        </div>
      </section>
    </>
  );
}
