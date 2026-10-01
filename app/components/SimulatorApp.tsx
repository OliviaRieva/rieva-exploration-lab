"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { siteConfig } from "../../lib/site-config";
import {
  centralBodies,
  exoplanetResearchTargets,
  getCentralBody,
  spacecraftDesigns,
  type CentralBodyId,
  type SpacecraftDesignId,
} from "../../lib/orbital/catalog";
import {
  DEFAULT_MISSION_PARAMETERS,
  DEFAULT_SOLVER_SETTINGS,
  SECONDS_PER_DAY,
  simulateMissionComparison,
  validateMissionParameters,
  type ComparisonResult,
  type MissionParameters,
  type ScenarioResult,
  type ValidationIssue,
} from "../../lib/simulation";
import type {
  MissionWorkerRequest,
  MissionWorkerResponse,
} from "../workers/mission.worker";
import {
  MissionCharts,
  type MissionChartSample,
} from "./MissionCharts";
import { OrbitScene, type OrbitSceneSample } from "./OrbitScene";
import { PhysicsAndValidation, TechnologyLadder } from "./KnowledgeSections";

const HOURS = 3_600;
type ComputeStatus = "idle" | "calculating" | "ready" | "error";
type SelectedScenario = "interrupted" | "reference";

interface RunVisualContext {
  centralBodyId: CentralBodyId;
  spacecraftDesignId: SpacecraftDesignId;
}

interface FormState {
  centralBodyId: CentralBodyId;
  spacecraftDesignId: SpacecraftDesignId;
  initialAltitudeKm: number;
  targetAltitudeKm: number;
  dryMassKg: number;
  propellantMassKg: number;
  powerKw: number;
  specificImpulseS: number;
  efficiencyPct: number;
  interruptionStartDays: number;
  interruptionDurationHours: number;
  maxDurationDays: number;
}

const defaultForm: FormState = {
  centralBodyId: "earth",
  spacecraftDesignId: "hall-tug",
  initialAltitudeKm: DEFAULT_MISSION_PARAMETERS.initialAltitudeM / 1_000,
  targetAltitudeKm: DEFAULT_MISSION_PARAMETERS.targetAltitudeM / 1_000,
  dryMassKg: DEFAULT_MISSION_PARAMETERS.dryMassKg,
  propellantMassKg: DEFAULT_MISSION_PARAMETERS.propellantMassKg,
  powerKw: DEFAULT_MISSION_PARAMETERS.powerW / 1_000,
  specificImpulseS: DEFAULT_MISSION_PARAMETERS.specificImpulseS,
  efficiencyPct: DEFAULT_MISSION_PARAMETERS.efficiency * 100,
  interruptionStartDays:
    DEFAULT_MISSION_PARAMETERS.interruptionStartS / SECONDS_PER_DAY,
  interruptionDurationHours:
    DEFAULT_MISSION_PARAMETERS.interruptionDurationS / HOURS,
  maxDurationDays: DEFAULT_MISSION_PARAMETERS.maxDurationS / SECONDS_PER_DAY,
};

const missionPresets: Array<{
  name: string;
  description: string;
  values: Partial<FormState>;
}> = [
  {
    name: "LEO raise",
    description: "Balanced default transfer",
    values: defaultForm,
  },
  {
    name: "Power limited",
    description: "Longer transfer at 8 kW",
    values: {
      powerKw: 8,
      specificImpulseS: 2200,
      efficiencyPct: 62,
      maxDurationDays: 20,
      interruptionStartDays: 4,
      interruptionDurationHours: 12,
    },
  },
  {
    name: "Long outage",
    description: "Three-day engine interruption",
    values: {
      powerKw: 15,
      specificImpulseS: 1800,
      efficiencyPct: 65,
      interruptionStartDays: 2.5,
      interruptionDurationHours: 72,
      maxDurationDays: 14,
    },
  },
  {
    name: "Lunar scout",
    description: "100 → 500 km around the Moon",
    values: {
      centralBodyId: "moon",
      spacecraftDesignId: "ion-scout",
      initialAltitudeKm: 100,
      targetAltitudeKm: 500,
      dryMassKg: 520,
      propellantMassKg: 62,
      powerKw: 9,
      specificImpulseS: 3_000,
      efficiencyPct: 67,
      interruptionStartDays: 1.2,
      interruptionDurationHours: 10,
      maxDurationDays: 6,
    },
  },
  {
    name: "Mars relay",
    description: "300 → 1,500 km around Mars",
    values: {
      centralBodyId: "mars",
      spacecraftDesignId: "hall-tug",
      initialAltitudeKm: 300,
      targetAltitudeKm: 1_500,
      interruptionStartDays: 3,
      interruptionDurationHours: 24,
      maxDurationDays: 12,
    },
  },
];

function toMissionParameters(form: FormState): MissionParameters {
  const centralBody = getCentralBody(form.centralBodyId);
  return {
    centralBodyRadiusM: centralBody.meanRadiusM,
    centralBodyGravitationalParameterM3S2:
      centralBody.gravitationalParameterM3S2,
    initialAltitudeM: form.initialAltitudeKm * 1_000,
    targetAltitudeM: form.targetAltitudeKm * 1_000,
    dryMassKg: form.dryMassKg,
    propellantMassKg: form.propellantMassKg,
    powerW: form.powerKw * 1_000,
    specificImpulseS: form.specificImpulseS,
    efficiency: form.efficiencyPct / 100,
    interruptionStartS: form.interruptionStartDays * SECONDS_PER_DAY,
    interruptionDurationS: form.interruptionDurationHours * HOURS,
    maxDurationS: form.maxDurationDays * SECONDS_PER_DAY,
  };
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "Not reached";
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / HOURS);
  const minutes = Math.floor((seconds % HOURS) / 60);
  if (days > 0) return `${days} d ${hours} h ${minutes} min`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const days = Math.floor(safe / SECONDS_PER_DAY);
  const hours = Math.floor((safe % SECONDS_PER_DAY) / HOURS);
  const minutes = Math.floor((safe % HOURS) / 60);
  const secs = Math.floor(safe % 60);
  return `${String(days).padStart(2, "0")}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
}

function formatMetric(value: number, options: Intl.NumberFormatOptions = {}) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", options);
}

function seriesIndex(result: ComparisonResult, timeS: number) {
  return Math.max(
    0,
    Math.min(
      result.timeS.length - 1,
      Math.round(timeS / result.settings.outputStepS),
    ),
  );
}

function validIndex(scenario: ScenarioResult, requested: number) {
  return Math.max(0, Math.min(scenario.series.validLength - 1, requested));
}

function finalAltitudeKm(scenario: ScenarioResult) {
  const index = Math.max(0, scenario.series.validLength - 1);
  return scenario.series.altitudeM[index] / 1_000;
}

function makeOrbitSamples(
  result: ComparisonResult,
  scenario: ScenarioResult,
): OrbitSceneSample[] {
  const samples: OrbitSceneSample[] = [];
  for (let index = 0; index < scenario.series.validLength; index += 1) {
    samples.push({
      timeS: result.timeS[index],
      xM: scenario.series.xM[index],
      yM: scenario.series.yM[index],
      vxMps: scenario.series.vxMps[index],
      vyMps: scenario.series.vyMps[index],
      thrustN: scenario.series.thrustN[index],
    });
  }
  return samples;
}

function makeChartSamples(
  result: ComparisonResult,
  scenario: ScenarioResult,
): MissionChartSample[] {
  const samples: MissionChartSample[] = [];
  for (let index = 0; index < scenario.series.validLength; index += 1) {
    samples.push({
      timeS: result.timeS[index],
      altitudeM: scenario.series.altitudeM[index],
      propellantKg: scenario.series.propellantKg[index],
      thrustN: scenario.series.thrustN[index],
    });
  }
  return samples;
}

function issueFor(issues: ValidationIssue[], field: keyof MissionParameters) {
  return issues.find((issue) => issue.field === field)?.message;
}

function downloadCsv(result: ComparisonResult, missionName: string) {
  const header = [
    "time_s",
    "time_days",
    "reference_x_m",
    "reference_y_m",
    "reference_altitude_m",
    "reference_speed_m_s",
    "reference_propellant_kg",
    "reference_thrust_n",
    "reference_semimajor_axis_m",
    "reference_eccentricity",
    "interrupted_x_m",
    "interrupted_y_m",
    "interrupted_altitude_m",
    "interrupted_speed_m_s",
    "interrupted_propellant_kg",
    "interrupted_thrust_n",
    "interrupted_semimajor_axis_m",
    "interrupted_eccentricity",
  ];

  const value = (scenario: ScenarioResult, key: keyof ScenarioResult["series"], index: number) => {
    if (index >= scenario.series.validLength) return "";
    const column = scenario.series[key];
    return Array.isArray(column) ? String(column[index]) : "";
  };

  const rows = result.timeS.map((timeS, index) =>
    [
      timeS,
      timeS / SECONDS_PER_DAY,
      value(result.reference, "xM", index),
      value(result.reference, "yM", index),
      value(result.reference, "altitudeM", index),
      value(result.reference, "speedMps", index),
      value(result.reference, "propellantKg", index),
      value(result.reference, "thrustN", index),
      value(result.reference, "semimajorAxisM", index),
      value(result.reference, "eccentricity", index),
      value(result.interrupted, "xM", index),
      value(result.interrupted, "yM", index),
      value(result.interrupted, "altitudeM", index),
      value(result.interrupted, "speedMps", index),
      value(result.interrupted, "propellantKg", index),
      value(result.interrupted, "thrustN", index),
      value(result.interrupted, "semimajorAxisM", index),
      value(result.interrupted, "eccentricity", index),
    ].join(","),
  );

  const blob = new Blob([[header.join(","), ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${missionName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rieva-mission"}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export interface SimulatorAppProps {
  active?: boolean;
}

export function SimulatorApp({ active = true }: SimulatorAppProps) {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [missionName, setMissionName] = useState<string>(siteConfig.defaultMissionName);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [computeStatus, setComputeStatus] = useState<ComputeStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [workerNote, setWorkerNote] = useState("");
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [inputsDirty, setInputsDirty] = useState(false);
  const [selectedScenario, setSelectedScenario] =
    useState<SelectedScenario>("interrupted");
  const [playheadTimeS, setPlayheadTimeS] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(4);
  const [announcement, setAnnouncement] = useState("");
  const [appliedTechnology, setAppliedTechnology] = useState("");
  const [runVisualContext, setRunVisualContext] =
    useState<RunVisualContext | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const autoRunRef = useRef(false);
  const formRevisionRef = useRef(0);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const parameters = useMemo(() => toMissionParameters(form), [form]);
  const centralBody = useMemo(
    () => getCentralBody(form.centralBodyId),
    [form.centralBodyId],
  );
  const selectedSpacecraft = useMemo(
    () =>
      spacecraftDesigns.find((design) => design.id === form.spacecraftDesignId) ??
      spacecraftDesigns[1],
    [form.spacecraftDesignId],
  );
  const displayedCentralBody = useMemo(
    () =>
      getCentralBody(
        runVisualContext?.centralBodyId ?? form.centralBodyId,
      ),
    [form.centralBodyId, runVisualContext],
  );
  const displayedSpacecraftDesignId =
    runVisualContext?.spacecraftDesignId ?? form.spacecraftDesignId;
  const displayedParameters = result?.parameters ?? parameters;
  const maxTimeS = result?.timeS[result.timeS.length - 1] ?? parameters.maxDurationS;
  const interruption = useMemo(
    () => ({
      startS: displayedParameters.interruptionStartS,
      endS: Math.min(
        displayedParameters.maxDurationS,
        displayedParameters.interruptionStartS +
          displayedParameters.interruptionDurationS,
      ),
    }),
    [displayedParameters],
  );

  const markInputsChanged = useCallback(() => {
    formRevisionRef.current += 1;
    setInputsDirty(true);
  }, []);

  const updateField = useCallback(
    (field: keyof FormState, value: number) => {
      setForm((current) => ({ ...current, [field]: value }));
      markInputsChanged();
      setAppliedTechnology("");
    },
    [markInputsChanged],
  );

  const finishWithResult = useCallback((
    nextResult: ComparisonResult,
    context: RunVisualContext,
    submittedRevision: number,
  ) => {
    setResult(nextResult);
    setRunVisualContext(context);
    setComputeStatus("ready");
    setProgress(1);
    setPlayheadTimeS(0);
    setIsPlaying(
      activeRef.current &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    setInputsDirty(formRevisionRef.current !== submittedRevision);
    const referenceOutcome = nextResult.reference.summary.targetMet
      ? `Reference target met at ${formatDuration(nextResult.reference.summary.targetMetAtS)}.`
      : "Reference target not met within the mission limit.";
    const interruptedOutcome = nextResult.interrupted.summary.targetMet
      ? `Interrupted target met at ${formatDuration(nextResult.interrupted.summary.targetMetAtS)}.`
      : "Interrupted target not met within the mission limit.";
    setAnnouncement(`Simulation complete. ${referenceOutcome} ${interruptedOutcome}`);
  }, []);

  const runSimulation = useCallback(() => {
    const nextParameters = toMissionParameters(form);
    const submittedContext: RunVisualContext = {
      centralBodyId: form.centralBodyId,
      spacecraftDesignId: form.spacecraftDesignId,
    };
    const submittedRevision = formRevisionRef.current;
    const nextIssues = validateMissionParameters(nextParameters);
    setIssues(nextIssues);
    setErrorMessage("");
    setWorkerNote("");
    if (nextIssues.length > 0) {
      setComputeStatus("error");
      setAnnouncement("Simulation could not start. Check the highlighted inputs.");
      return;
    }

    workerRef.current?.terminate();
    setComputeStatus("calculating");
    setProgress(0.02);
    setIsPlaying(false);
    setAnnouncement("Propagating reference and interrupted trajectories.");
    const requestId = `mission-${Date.now()}-${++requestIdRef.current}`;

    try {
      const worker = new Worker(
        new URL("../workers/mission.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<MissionWorkerResponse>) => {
        const message = event.data;
        if (message.requestId !== requestId) return;
        if (message.type === "PROGRESS") {
          setProgress(message.fraction);
        } else if (message.type === "RESULT") {
          finishWithResult(
            message.result,
            submittedContext,
            submittedRevision,
          );
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
        } else if (message.type === "ERROR") {
          setComputeStatus("error");
          setIssues(message.issues);
          setErrorMessage(message.message);
          setAnnouncement("Simulation stopped. Inputs were preserved.");
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
        }
      };
      worker.onerror = () => {
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        setWorkerNote("Worker unavailable; this run used the same solver on the main thread.");
        window.setTimeout(() => {
          try {
            finishWithResult(
              simulateMissionComparison(nextParameters),
              submittedContext,
              submittedRevision,
            );
          } catch (error) {
            setComputeStatus("error");
            setErrorMessage(error instanceof Error ? error.message : "Simulation failed.");
          }
        }, 0);
      };
      const request: MissionWorkerRequest = {
        type: "RUN",
        requestId,
        parameters: nextParameters,
      };
      worker.postMessage(request);
    } catch {
      setWorkerNote("Worker unavailable; this run used the same solver on the main thread.");
      window.setTimeout(() => {
        try {
          finishWithResult(
            simulateMissionComparison(nextParameters),
            submittedContext,
            submittedRevision,
          );
        } catch (error) {
          setComputeStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Simulation failed.");
        }
      }, 0);
    }
  }, [finishWithResult, form]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      if (!autoRunRef.current) {
        autoRunRef.current = true;
        runSimulation();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, runSimulation]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  useEffect(() => {
    if (!active || !isPlaying || !result) return;
    let frame = 0;
    let previous = performance.now();
    const simulatedSecondsPerRealSecond = 6 * HOURS * playbackSpeed;
    const tick = (now: number) => {
      const elapsedRealSeconds = Math.min(0.1, (now - previous) / 1_000);
      previous = now;
      setPlayheadTimeS((current) => {
        const next = Math.min(
          result.timeS[result.timeS.length - 1],
          current + elapsedRealSeconds * simulatedSecondsPerRealSecond,
        );
        if (next >= result.timeS[result.timeS.length - 1]) {
          setIsPlaying(false);
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, isPlaying, playbackSpeed, result]);

  const orbitData = useMemo(() => {
    if (!result) return { reference: [], interrupted: [] };
    return {
      reference: makeOrbitSamples(result, result.reference),
      interrupted: makeOrbitSamples(result, result.interrupted),
    };
  }, [result]);

  const chartData = useMemo(() => {
    if (!result) return { reference: [], interrupted: [] };
    return {
      reference: makeChartSamples(result, result.reference),
      interrupted: makeChartSamples(result, result.interrupted),
    };
  }, [result]);

  const sample = useMemo(() => {
    if (!result) return null;
    const scenario = result[selectedScenario];
    const index = validIndex(scenario, seriesIndex(result, playheadTimeS));
    return {
      index,
      scenario,
      altitudeM: scenario.series.altitudeM[index],
      speedMps: scenario.series.speedMps[index],
      propellantKg: scenario.series.propellantKg[index],
      thrustN: scenario.series.thrustN[index],
      semimajorAxisM: scenario.series.semimajorAxisM[index],
      eccentricity: scenario.series.eccentricity[index],
    };
  }, [playheadTimeS, result, selectedScenario]);

  const targetGateMet = Boolean(
    sample &&
      Math.abs(
        sample.semimajorAxisM -
          (displayedParameters.centralBodyRadiusM +
            displayedParameters.targetAltitudeM),
      ) <= DEFAULT_SOLVER_SETTINGS.semimajorAxisToleranceM &&
      sample.eccentricity <= DEFAULT_SOLVER_SETTINGS.eccentricityTolerance,
  );

  const comparisonNarrative = useMemo(() => {
    if (!result) return "Run a comparison to generate a results summary from the propagated data.";
    const reference = result.reference.summary;
    const interrupted = result.interrupted.summary;
    const outageHours = result.parameters.interruptionDurationS / HOURS;
    const sentences = [
      `The interruption begins at day ${(result.parameters.interruptionStartS / SECONDS_PER_DAY).toFixed(2)} and commands exactly zero thrust for ${outageHours.toFixed(1)} hours.`,
    ];
    if (reference.targetMetAtS !== null && interrupted.targetMetAtS !== null) {
      sentences.push(
        `The reference reaches the target gate in ${formatDuration(reference.targetMetAtS)}; the interrupted mission reaches it ${formatDuration(interrupted.targetMetAtS - reference.targetMetAtS)} later.`,
      );
    } else if (reference.targetMet && !interrupted.targetMet) {
      sentences.push("The reference reaches the target gate, while the interrupted case does not do so before the mission limit.");
    } else if (!reference.targetMet && !interrupted.targetMet) {
      sentences.push("Neither case meets both target-gate tolerances before the mission limit.");
    }
    const altitudeGap = finalAltitudeKm(result.reference) - finalAltitudeKm(result.interrupted);
    sentences.push(
      `At the common mission end, the interrupted trajectory is ${Math.abs(altitudeGap).toFixed(1)} km ${altitudeGap >= 0 ? "below" : "above"} the reference trajectory.`,
    );
    return sentences.join(" ");
  }, [result]);

  const applyMissionPreset = (preset: (typeof missionPresets)[number]) => {
    setForm((current) => ({ ...current, ...preset.values }));
    markInputsChanged();
    setAppliedTechnology("");
  };

  const chooseCentralBody = (id: CentralBodyId) => {
    const body = getCentralBody(id);
    setForm((current) => ({
      ...current,
      centralBodyId: id,
      initialAltitudeKm: body.initialAltitudeKm,
      targetAltitudeKm: body.targetAltitudeKm,
      maxDurationDays: body.missionDurationDays,
      interruptionStartDays: Math.min(
        current.interruptionStartDays,
        body.missionDurationDays * 0.55,
      ),
    }));
    markInputsChanged();
    setAppliedTechnology("");
  };

  const chooseSpacecraft = (id: SpacecraftDesignId) => {
    const design = spacecraftDesigns.find((candidate) => candidate.id === id);
    if (!design) return;
    setForm((current) => ({
      ...current,
      spacecraftDesignId: id,
      dryMassKg: design.dryMassKg,
      propellantMassKg: design.propellantMassKg,
      powerKw: design.powerKw,
      specificImpulseS: design.specificImpulseS,
      efficiencyPct: design.efficiencyPct,
    }));
    markInputsChanged();
    setAppliedTechnology("");
  };

  const applyTechnology = (
    settings: {
      powerKw: number;
      specificImpulseS: number;
      efficiencyPct: number;
      maxDurationDays?: number;
    },
    label: string,
  ) => {
    setForm((current) => ({ ...current, ...settings }));
    markInputsChanged();
    setAppliedTechnology(label);
    document.getElementById("mission")?.scrollIntoView({ behavior: "smooth" });
  };

  const field = (
    label: string,
    key: keyof FormState,
    unit: string,
    input: {
      min: number;
      max: number;
      step: number;
      parameterField: keyof MissionParameters;
      help?: string;
    },
  ) => {
    const error = issueFor(issues, input.parameterField);
    const id = `field-${key}`;
    return (
      <label className={`parameter-field ${error ? "parameter-field-error" : ""}`} htmlFor={id}>
        <span className="parameter-label">
          <span>{label}</span>
          <span className="parameter-unit">{unit}</span>
        </span>
        <input
          id={id}
          type="number"
          min={input.min}
          max={input.max}
          step={input.step}
          value={form[key]}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : input.help ? `${id}-help` : undefined}
          onChange={(event) => updateField(key, event.currentTarget.valueAsNumber)}
        />
        {error ? (
          <span className="field-error" id={`${id}-error`}>{error}</span>
        ) : input.help ? (
          <span className="field-help" id={`${id}-help`}>{input.help}</span>
        ) : null}
      </label>
    );
  };

  return (
    <div className="site-shell">
      <a className="skip-link" href="#mission">Skip to simulator</a>
      <header className="site-header">
        <a className="brand" href="#top" aria-label={`${siteConfig.name} home`}>
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>
            <strong>{siteConfig.wordmark}</strong>
            <small>{siteConfig.descriptor}</small>
          </span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#mission">Mission</a>
          <a href="#compare">Compare</a>
          <a href="#technology">Technology</a>
          <a href="#physics">Physics</a>
          <a href="#validation">Validation</a>
        </nav>
        <div className="header-actions">
          <span className="local-pill"><span aria-hidden="true" /> Runs locally</span>
          <button
            className="button button-quiet export-header"
            type="button"
            disabled={!result}
            onClick={() => result && downloadCsv(result, missionName)}
          >
            Export CSV
          </button>
        </div>
      </header>

      <main id="top">
        <section className="intro-shell" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">Low-thrust mission workbench</p>
            <h1 id="page-title">Shape an orbit. Interrupt the engine. Measure what changes.</h1>
            <p className="intro-copy">
              Choose a central world and electric spacecraft, then compare continuous prograde thrust with the identical vehicle under one power-loss window. Every trajectory is propagated from the stated equations in your browser.
            </p>
          </div>
          <div className="model-strip" aria-label="Model characteristics">
            <span>Planar two-body</span>
            <span>Prograde guidance</span>
            <span>SI internal units</span>
            <span>Reference + interrupted</span>
            <span>9 central bodies</span>
          </div>
        </section>

        <section className="mission-section" id="mission" aria-labelledby="mission-title">
          <div className="mission-toolbar">
            <div>
              <p className="eyebrow">Mission console</p>
              <h2 id="mission-title">Propagate two futures.</h2>
            </div>
            <div className="mission-status-line">
              <span className={`run-state run-state-${computeStatus}`}>
                {computeStatus === "calculating"
                  ? `Propagating · ${Math.round(progress * 100)}%`
                  : computeStatus === "ready"
                    ? "Solution ready"
                    : computeStatus === "error"
                      ? "Action needed"
                      : "Ready to run"}
              </span>
              {inputsDirty ? <span className="dirty-state">Inputs changed · run again</span> : null}
            </div>
          </div>

          <div className="mission-deck">
            <aside className="control-rail" aria-label="Mission inputs">
              <div className="rail-heading">
                <span className="mono-label">Mission inputs</span>
                <p>Both trajectories share these values. Only the amber case loses thrust.</p>
              </div>

              <div className="preset-list" aria-label="Mission presets">
                {missionPresets.map((preset) => (
                  <button
                    type="button"
                    className="preset-button"
                    key={preset.name}
                    onClick={() => applyMissionPreset(preset)}
                  >
                    <strong>{preset.name}</strong>
                    <span>{preset.description}</span>
                  </button>
                ))}
              </div>

              <div className="input-section environment-selector">
                <h3>Destination</h3>
                <label className="parameter-field" htmlFor="central-body">
                  <span className="parameter-label">
                    <span>Central body</span>
                    <span className="parameter-unit">local orbit</span>
                  </span>
                  <select
                    id="central-body"
                    value={form.centralBodyId}
                    onChange={(event) =>
                      chooseCentralBody(event.currentTarget.value as CentralBodyId)
                    }
                  >
                    {centralBodies.map((body) => (
                      <option key={body.id} value={body.id}>{body.name}</option>
                    ))}
                  </select>
                </label>
                <div className="body-readout">
                  <strong>{centralBody.name}</strong>
                  <span>μ = {centralBody.gravitationalParameterM3S2.toExponential(5)} m³/s²</span>
                  <span>Mean radius = {(centralBody.meanRadiusM / 1_000).toLocaleString("en-US")} km</span>
                  <p>{centralBody.note}</p>
                </div>
              </div>

              <div className="input-section spacecraft-selector">
                <h3>Spacecraft family</h3>
                <div className="spacecraft-options" role="group" aria-label="Electric spacecraft concept">
                  {spacecraftDesigns.map((design) => (
                    <button
                      key={design.id}
                      type="button"
                      aria-pressed={form.spacecraftDesignId === design.id}
                      onClick={() => chooseSpacecraft(design.id)}
                    >
                      <span className={`spacecraft-miniature spacecraft-miniature--${design.id}`} aria-hidden="true"><i /></span>
                      <span><strong>{design.name}</strong><small>{design.description}</small></span>
                    </button>
                  ))}
                </div>
                <p className="input-context">{selectedSpacecraft.evidence}</p>
              </div>

              <div className="input-section">
                <h3>Orbit</h3>
                {field("Initial altitude", "initialAltitudeKm", "km", {
                  min: 1,
                  max: 100_000,
                  step: 10,
                  parameterField: "initialAltitudeM",
                })}
                {field("Target altitude", "targetAltitudeKm", "km", {
                  min: 130,
                  max: 100_000,
                  step: 10,
                  parameterField: "targetAltitudeM",
                })}
                {form.initialAltitudeKm < 200 ? (
                  <p className="input-warning">
                    Very-low-orbit perturbations can dominate in reality but are omitted here.
                  </p>
                ) : null}
              </div>

              <div className="input-section">
                <h3>Spacecraft</h3>
                {field("Dry mass", "dryMassKg", "kg", {
                  min: 1,
                  max: 50_000,
                  step: 10,
                  parameterField: "dryMassKg",
                })}
                {field("Initial propellant", "propellantMassKg", "kg", {
                  min: 0,
                  max: 10_000,
                  step: 1,
                  parameterField: "propellantMassKg",
                })}
              </div>

              <div className="input-section">
                <h3>Propulsion</h3>
                {field("Electrical power", "powerKw", "kW", {
                  min: 0,
                  max: 500,
                  step: 0.1,
                  parameterField: "powerW",
                })}
                {field("Specific impulse", "specificImpulseS", "s", {
                  min: 100,
                  max: 20_000,
                  step: 10,
                  parameterField: "specificImpulseS",
                })}
                {field("Efficiency", "efficiencyPct", "%", {
                  min: 0,
                  max: 100,
                  step: 1,
                  parameterField: "efficiency",
                })}
              </div>

              <div className="input-section">
                <h3>Scenario</h3>
                {field("Interruption start", "interruptionStartDays", "day", {
                  min: 0,
                  max: 120,
                  step: 0.1,
                  parameterField: "interruptionStartS",
                })}
                {field("Interruption duration", "interruptionDurationHours", "h", {
                  min: 0,
                  max: 2_880,
                  step: 1,
                  parameterField: "interruptionDurationS",
                })}
                {field("Mission limit", "maxDurationDays", "day", {
                  min: 0.1,
                  max: 120,
                  step: 0.5,
                  parameterField: "maxDurationS",
                })}
              </div>

              {appliedTechnology ? (
                <p className="technology-applied">Applied: {appliedTechnology}. Run again to compare.</p>
              ) : null}
              {errorMessage ? <p className="rail-error">{errorMessage}</p> : null}
              <div className="rail-actions">
                <button
                  className="button button-primary"
                  type="button"
                  disabled={computeStatus === "calculating"}
                  onClick={runSimulation}
                >
                  {computeStatus === "calculating" ? "Propagating…" : "Run comparison"}
                </button>
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => {
                    setForm(defaultForm);
                    setIssues([]);
                    markInputsChanged();
                    setAppliedTechnology("");
                  }}
                >
                  Restore defaults
                </button>
              </div>
            </aside>

            <div className="visualization-column">
              <div className="visualization-heading">
                <div>
                  <p className="eyebrow">Live mission view</p>
                  <label className="mission-name-label" htmlFor="mission-name">Mission name</label>
                  <input
                    id="mission-name"
                    className="mission-name-input"
                    value={missionName}
                    onChange={(event) => setMissionName(event.currentTarget.value)}
                  />
                </div>
                <span className="status-chip">{displayedCentralBody.name} · 3D view · planar dynamics</span>
              </div>
              <div className="scene-frame">
                <OrbitScene
                  reference={orbitData.reference}
                  interrupted={orbitData.interrupted}
                  currentTimeS={playheadTimeS}
                  targetRadiusM={displayedCentralBody.meanRadiusM + displayedParameters.targetAltitudeM}
                  earthRadiusM={displayedCentralBody.meanRadiusM}
                  bodyName={displayedCentralBody.name}
                  bodyVisual={displayedCentralBody.visual}
                  solarDistanceAu={displayedCentralBody.solarDistanceAu}
                  bodyRotationPeriodS={displayedCentralBody.rotationPeriodS}
                  spacecraftDesign={displayedSpacecraftDesignId}
                  outage={interruption}
                  isPlaying={isPlaying}
                />
                {computeStatus === "calculating" ? (
                  <div className="scene-loading" role="status">
                    <span className="loading-orbit" aria-hidden="true" />
                    <strong>Propagating two trajectories…</strong>
                    <span>{Math.round(progress * 100)}% · RK4 in a browser worker</span>
                    <progress value={progress} max={1} aria-label="Simulation progress" />
                  </div>
                ) : !result ? (
                  <div className="scene-empty">
                    Configure the mission and run a comparison to populate the trajectory.
                  </div>
                ) : null}
              </div>
              <div className="trajectory-explainer" aria-label="Why two spacecraft are shown">
                <div><i className="trajectory-swatch trajectory-swatch--reference" /><span><strong>Cyan spacecraft</strong>Reference run: thrust remains available.</span></div>
                <div><i className="trajectory-swatch trajectory-swatch--interrupted" /><span><strong>Amber spacecraft</strong>Same initial state, but thrust is zero during the chosen interruption.</span></div>
                <p>
                  Both markers may overlap before the outage. Their luminous electric-propulsion plumes are intentionally exaggerated so thrust state is visible; real ion and Hall thruster plumes are much fainter than chemical-rocket flames.
                </p>
              </div>
            </div>

            <aside className="telemetry-rail" aria-label="Mission telemetry">
              <div className="scenario-tabs" role="group" aria-label="Telemetry case">
                <button
                  type="button"
                  aria-pressed={selectedScenario === "interrupted"}
                  onClick={() => setSelectedScenario("interrupted")}
                >
                  Interrupted
                </button>
                <button
                  type="button"
                  aria-pressed={selectedScenario === "reference"}
                  onClick={() => setSelectedScenario("reference")}
                >
                  Reference
                </button>
              </div>
              <p className="telemetry-context">Compared at the same mission time.</p>

              <div className="mission-clock">
                <span>Mission clock</span>
                <strong>{formatClock(playheadTimeS)}</strong>
              </div>
              <div className="telemetry-grid">
                <div className="metric-card">
                  <span>Altitude</span>
                  <strong>{sample ? formatMetric(sample.altitudeM / 1_000, { maximumFractionDigits: 1 }) : "—"}</strong>
                  <small>km</small>
                </div>
                <div className="metric-card">
                  <span>Speed</span>
                  <strong>{sample ? formatMetric(sample.speedMps / 1_000, { maximumFractionDigits: 3 }) : "—"}</strong>
                  <small>km/s</small>
                </div>
                <div className="metric-card">
                  <span>Propellant</span>
                  <strong>{sample ? formatMetric(sample.propellantKg, { maximumFractionDigits: 2 }) : "—"}</strong>
                  <small>kg</small>
                </div>
                <div className="metric-card">
                  <span>Thrust</span>
                  <strong>{sample ? formatMetric(sample.thrustN, { maximumFractionDigits: 4 }) : "—"}</strong>
                  <small>N</small>
                </div>
                <div className="metric-card metric-wide">
                  <span>Semimajor axis</span>
                  <strong>{sample ? formatMetric(sample.semimajorAxisM / 1_000, { maximumFractionDigits: 1 }) : "—"}</strong>
                  <small>km from {displayedCentralBody.name} center</small>
                </div>
                <div className="metric-card metric-wide">
                  <span>Eccentricity</span>
                  <strong>{sample ? sample.eccentricity.toFixed(6) : "—"}</strong>
                  <small>dimensionless</small>
                </div>
              </div>

              <div className={`target-gate ${targetGateMet ? "target-gate-met" : ""}`}>
                <div>
                  <span>Target-orbit gate</span>
                  <strong>{targetGateMet ? "Target met" : result ? "Not yet met" : "Awaiting run"}</strong>
                </div>
                <dl>
                  <div><dt>|a − aₜ|</dt><dd>≤ 10 km</dd></div>
                  <div><dt>e</dt><dd>≤ 0.005</dd></div>
                </dl>
                <p>Crossing target altitude alone is not circular-orbit insertion.</p>
              </div>
              <div className="model-boundary-note">
                <strong>{displayedCentralBody.name} local model</strong>
                <p>
                  The Sun is drawn for spatial context at a relative apparent size. Its gravity is not propagated, so this tool does not predict solar capture or a probability of spacecraft loss.
                </p>
              </div>
              {workerNote ? <p className="worker-note">{workerNote}</p> : null}
            </aside>

            <div className="playback-bar">
              <div className="playback-buttons">
                <button
                  className="play-button"
                  type="button"
                  disabled={!result || computeStatus === "calculating"}
                  onClick={() => {
                    if (playheadTimeS >= maxTimeS) setPlayheadTimeS(0);
                    setIsPlaying(true);
                  }}
                >
                  <span aria-hidden="true">▶</span> Play
                </button>
                <button
                  type="button"
                  disabled={!result || !isPlaying}
                  onClick={() => setIsPlaying(false)}
                >
                  Pause
                </button>
                <button
                  type="button"
                  disabled={!result}
                  onClick={() => {
                    setIsPlaying(false);
                    setPlayheadTimeS(0);
                  }}
                >
                  Reset
                </button>
              </div>
              <label className="timeline-control">
                <span className="sr-only">Simulation timeline</span>
                <input
                  type="range"
                  min={0}
                  max={maxTimeS}
                  step={result?.settings.outputStepS ?? 60}
                  value={Math.min(playheadTimeS, maxTimeS)}
                  disabled={!result}
                  onChange={(event) => {
                    setIsPlaying(false);
                    setPlayheadTimeS(event.currentTarget.valueAsNumber);
                  }}
                />
                <span>{formatClock(playheadTimeS)} / {formatClock(maxTimeS)}</span>
              </label>
              <div className="playback-options">
                <label>
                  <span>Speed</span>
                  <select
                    value={playbackSpeed}
                    onChange={(event) => setPlaybackSpeed(Number(event.currentTarget.value))}
                  >
                    <option value={0.5}>0.5×</option>
                    <option value={1}>1×</option>
                    <option value={4}>4×</option>
                    <option value={16}>16×</option>
                    <option value={64}>64×</option>
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!result}
                  onClick={() => setPlayheadTimeS(Math.min(interruption.startS, maxTimeS))}
                >
                  Jump to outage
                </button>
              </div>
              <p className="playback-scale">1× = 6 simulated hours per second</p>
            </div>
          </div>
        </section>

        <section className="section-shell comparison-section" id="compare" aria-labelledby="compare-title">
          <div className="section-heading comparison-heading">
            <div>
              <p className="eyebrow">Comparative results</p>
              <h2 id="compare-title">One interruption. One common clock.</h2>
              <p>
                Cyan and amber begin with identical states and guidance. The shaded interval marks zero commanded thrust for the interrupted mission.
              </p>
            </div>
            <button
              className="button button-secondary"
              type="button"
              disabled={!result}
              onClick={() => result && downloadCsv(result, missionName)}
            >
              Download actual CSV
            </button>
          </div>

          <div className="comparison-stats">
            <div>
              <span>Reference target</span>
              <strong>{result ? (result.reference.summary.targetMet ? formatDuration(result.reference.summary.targetMetAtS) : "Not met") : "—"}</strong>
            </div>
            <div>
              <span>Interrupted target</span>
              <strong>{result ? (result.interrupted.summary.targetMet ? formatDuration(result.interrupted.summary.targetMetAtS) : "Not met") : "—"}</strong>
            </div>
            <div>
              <span>Transfer delay</span>
              <strong>
                {result && result.reference.summary.targetMetAtS !== null && result.interrupted.summary.targetMetAtS !== null
                  ? formatDuration(result.interrupted.summary.targetMetAtS - result.reference.summary.targetMetAtS)
                  : "—"}
              </strong>
            </div>
            <div>
              <span>Final altitude gap</span>
              <strong>{result ? `${Math.abs(finalAltitudeKm(result.reference) - finalAltitudeKm(result.interrupted)).toFixed(1)} km` : "—"}</strong>
            </div>
          </div>

          {result ? (
            <MissionCharts
              reference={chartData.reference}
              interrupted={chartData.interrupted}
              currentTimeS={playheadTimeS}
              outage={interruption}
            />
          ) : (
            <div className="charts-empty">Run the mission to populate altitude, propellant and thrust charts.</div>
          )}

          <div className="computed-story">
            <span className="mono-label">What this run shows</span>
            <p>{comparisonNarrative}</p>
          </div>
        </section>

        <section className="section-shell destination-section" id="destinations" aria-labelledby="destinations-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Research destinations</p>
              <h2 id="destinations-title">Interesting is not the same as inhabited.</h2>
              <p>
                These distant worlds are observation targets, not selectable local-orbit models: their environments are incompletely known and present-day spacecraft cannot visit them on practical mission timescales.
              </p>
            </div>
          </div>
          <div className="exoplanet-grid">
            {exoplanetResearchTargets.map((target, index) => (
              <article key={target.name}>
                <span className="exoplanet-index">X{String(index + 1).padStart(2, "0")}</span>
                <div className="exoplanet-orb" aria-hidden="true"><i /></div>
                <p className="exoplanet-type">{target.type}</p>
                <h3>{target.name}</h3>
                <p>{target.whyInteresting}</p>
                <p className="exoplanet-boundary"><strong>Evidence boundary:</strong> {target.honestBoundary}</p>
                <a href={target.sourceUrl} target="_blank" rel="noreferrer">{target.sourceLabel}</a>
                <small className="exoplanet-source-meta">
                  Published: {target.publicationDate} · Verified: {target.verifiedDate}
                </small>
              </article>
            ))}
          </div>
          <p className="destination-source-note">
            Solar-system radii and gravitational constants use NASA/JPL physical-parameter tables, checked 30 September 2026. “Habitable zone” describes received starlight conditions under assumptions; it is not evidence for aliens.
          </p>
        </section>

        <TechnologyLadder onApply={applyTechnology} />
        <PhysicsAndValidation />
      </main>

      <footer className="site-footer">
        <div>
          <strong>{siteConfig.wordmark}</strong>
          <span>{siteConfig.tagline}</span>
        </div>
        <p>Educational first-order model · No accounts · No telemetry leaves your browser</p>
      </footer>
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
