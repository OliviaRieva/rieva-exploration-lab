"use client";

import { useId, useMemo } from "react";

export interface MissionChartSample {
  timeS: number;
  altitudeM: number;
  propellantKg: number;
  thrustN: number;
}

export interface MissionChartsOutage {
  startS: number;
  endS: number;
}

export interface MissionChartsProps {
  reference: readonly MissionChartSample[];
  interrupted: readonly MissionChartSample[];
  currentTimeS: number;
  outage?: MissionChartsOutage;
  className?: string;
}

type MetricKey = "altitudeM" | "propellantKg" | "thrustN";

interface MetricDefinition {
  key: MetricKey;
  title: string;
  subtitle: string;
  unit: string;
  includeZero: boolean;
  transform: (value: number) => number;
  decimals: number;
}

interface ChartGeometry {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const DAY_S = 86_400;
const CYAN = "#70deef";
const AMBER = "#ffb85c";
const GRID = "rgba(78, 65, 125, 0.16)";
const LABEL = "#625d74";
const CURRENT = "rgba(42, 34, 72, 0.62)";

const METRICS: readonly MetricDefinition[] = [
  {
    key: "altitudeM",
    title: "Altitude above reference radius",
    subtitle: "Local orbital altitude versus simulated day",
    unit: "km",
    includeZero: false,
    transform: (value) => value / 1000,
    decimals: 0,
  },
  {
    key: "propellantKg",
    title: "Propellant remaining",
    subtitle: "Onboard propellant versus simulated day",
    unit: "kg",
    includeZero: false,
    transform: (value) => value,
    decimals: 1,
  },
  {
    key: "thrustN",
    title: "Delivered thrust",
    subtitle: "Commanded thrust versus simulated day",
    unit: "mN",
    includeZero: true,
    transform: (value) => value * 1000,
    decimals: 1,
  },
] as const;

const GEOMETRY: ChartGeometry = {
  width: 760,
  height: 250,
  left: 68,
  right: 22,
  top: 22,
  bottom: 44,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function metricValue(sample: MissionChartSample, metric: MetricDefinition) {
  return metric.transform(sample[metric.key]);
}

function validSample(sample: MissionChartSample, metric: MetricDefinition) {
  return Number.isFinite(sample.timeS) && Number.isFinite(metricValue(sample, metric));
}

function interpolateMetric(
  samples: readonly MissionChartSample[],
  timeS: number,
  metric: MetricDefinition,
) {
  if (samples.length === 0) return null;
  if (timeS <= samples[0].timeS) return metricValue(samples[0], metric);
  if (timeS >= samples[samples.length - 1].timeS) {
    return metricValue(samples[samples.length - 1], metric);
  }

  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].timeS <= timeS) low = middle;
    else high = middle;
  }
  const start = samples[low];
  const end = samples[high];
  const duration = end.timeS - start.timeS;
  const mix = duration > 0 ? clamp((timeS - start.timeS) / duration, 0, 1) : 0;
  return (
    metricValue(start, metric) +
    (metricValue(end, metric) - metricValue(start, metric)) * mix
  );
}

function decimate(
  samples: readonly MissionChartSample[],
  metric: MetricDefinition,
  maximum = 650,
) {
  if (samples.length <= maximum) return samples;
  const stride = Math.ceil(samples.length / maximum);
  const result: MissionChartSample[] = [];
  for (let index = 0; index < samples.length; index += stride) {
    result.push(samples[index]);
  }
  const last = samples[samples.length - 1];
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}

function extent(
  reference: readonly MissionChartSample[],
  interrupted: readonly MissionChartSample[],
  metric: MetricDefinition,
) {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const sample of [...reference, ...interrupted]) {
    if (!validSample(sample, metric)) continue;
    const value = metricValue(sample, metric);
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return [0, 1] as const;
  if (metric.includeZero) minimum = Math.min(0, minimum);
  const span = maximum - minimum;
  const padding = span > 0 ? span * 0.09 : Math.max(Math.abs(maximum) * 0.08, 1);
  const lower = metric.includeZero && minimum === 0 ? 0 : minimum - padding;
  return [lower, maximum + padding] as const;
}

function linePath(
  samples: readonly MissionChartSample[],
  metric: MetricDefinition,
  timeMaximum: number,
  valueMinimum: number,
  valueMaximum: number,
) {
  const plotWidth = GEOMETRY.width - GEOMETRY.left - GEOMETRY.right;
  const plotHeight = GEOMETRY.height - GEOMETRY.top - GEOMETRY.bottom;
  const timeSpan = Math.max(timeMaximum, 1);
  const valueSpan = Math.max(valueMaximum - valueMinimum, Number.EPSILON);
  return decimate(samples, metric)
    .map((sample, index) => {
      const x = GEOMETRY.left + (clamp(sample.timeS, 0, timeSpan) / timeSpan) * plotWidth;
      const y =
        GEOMETRY.top +
        (1 - (metricValue(sample, metric) - valueMinimum) / valueSpan) * plotHeight;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function areaPath(
  samples: readonly MissionChartSample[],
  metric: MetricDefinition,
  timeMaximum: number,
  valueMinimum: number,
  valueMaximum: number,
) {
  const plotWidth = GEOMETRY.width - GEOMETRY.left - GEOMETRY.right;
  const plotHeight = GEOMETRY.height - GEOMETRY.top - GEOMETRY.bottom;
  const baseline = GEOMETRY.top + plotHeight;
  const timeSpan = Math.max(timeMaximum, 1);
  const valueSpan = Math.max(valueMaximum - valueMinimum, Number.EPSILON);
  const selected = decimate(samples, metric);
  if (selected.length === 0) return "";
  const points = selected.map((sample) => ({
    x: GEOMETRY.left + (clamp(sample.timeS, 0, timeSpan) / timeSpan) * plotWidth,
    y:
      GEOMETRY.top +
      (1 - (metricValue(sample, metric) - valueMinimum) / valueSpan) * plotHeight,
  }));
  const first = points[0];
  const last = points[points.length - 1];
  return [
    `M${first.x.toFixed(2)},${baseline.toFixed(2)}`,
    ...points.map(
      (point) => `L${point.x.toFixed(2)},${point.y.toFixed(2)}`,
    ),
    `L${last.x.toFixed(2)},${baseline.toFixed(2)} Z`,
  ].join(" ");
}

function formatNumber(value: number, decimals: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatAxisValue(value: number, span: number) {
  const magnitude = Math.max(Math.abs(value), Math.abs(span));
  if (magnitude >= 10_000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (magnitude >= 100) return value.toFixed(0);
  if (magnitude >= 10) return value.toFixed(1).replace(/\.0$/, "");
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function timeLabel(timeS: number, maximumTimeS: number) {
  const days = timeS / DAY_S;
  const maximumDays = maximumTimeS / DAY_S;
  const decimals = maximumDays < 1 ? 2 : maximumDays < 10 ? 1 : 0;
  return days.toFixed(decimals);
}

function chartSummary(
  metric: MetricDefinition,
  currentTimeS: number,
  referenceValue: number | null,
  interruptedValue: number | null,
  outage?: MissionChartsOutage,
) {
  const day = currentTimeS / DAY_S;
  const when = `At mission day ${day.toFixed(day < 10 ? 2 : 1)}`;
  const values: string[] = [];
  if (referenceValue !== null) {
    values.push(
      `the reference case is ${formatNumber(referenceValue, metric.decimals)} ${metric.unit}`,
    );
  }
  if (interruptedValue !== null) {
    values.push(
      `the interrupted case is ${formatNumber(interruptedValue, metric.decimals)} ${metric.unit}`,
    );
  }

  let comparison = "";
  if (referenceValue !== null && interruptedValue !== null) {
    const difference = interruptedValue - referenceValue;
    comparison = ` Interrupted minus reference is ${difference >= 0 ? "+" : "−"}${formatNumber(Math.abs(difference), metric.decimals)} ${metric.unit}.`;
  }
  const outageSentence = outage
    ? ` The specified outage spans day ${(outage.startS / DAY_S).toFixed(2)} to ${(outage.endS / DAY_S).toFixed(2)}.`
    : "";
  return `${when}, ${values.length > 0 ? values.join(" and ") : "no finite value is available"}.${comparison}${outageSentence}`;
}

function MetricChart({
  metric,
  reference,
  interrupted,
  currentTimeS,
  maximumTimeS,
  outage,
}: {
  metric: MetricDefinition;
  reference: readonly MissionChartSample[];
  interrupted: readonly MissionChartSample[];
  currentTimeS: number;
  maximumTimeS: number;
  outage?: MissionChartsOutage;
}) {
  const rawId = useId();
  const id = rawId.replace(/:/g, "");
  const titleId = `mission-chart-title-${metric.key}-${id}`;
  const descriptionId = `mission-chart-description-${metric.key}-${id}`;
  const clipId = `mission-chart-clip-${metric.key}-${id}`;
  const referenceFillId = `mission-chart-reference-fill-${metric.key}-${id}`;
  const interruptedFillId = `mission-chart-interrupted-fill-${metric.key}-${id}`;
  const outagePatternId = `mission-chart-outage-pattern-${metric.key}-${id}`;
  const referenceFinite = useMemo(
    () => reference.filter((sample) => validSample(sample, metric)),
    [metric, reference],
  );
  const interruptedFinite = useMemo(
    () => interrupted.filter((sample) => validSample(sample, metric)),
    [interrupted, metric],
  );
  const [minimum, maximum] = useMemo(
    () => extent(referenceFinite, interruptedFinite, metric),
    [interruptedFinite, metric, referenceFinite],
  );
  const plotWidth = GEOMETRY.width - GEOMETRY.left - GEOMETRY.right;
  const plotHeight = GEOMETRY.height - GEOMETRY.top - GEOMETRY.bottom;
  const timeSpan = Math.max(maximumTimeS, 1);
  const valueSpan = Math.max(maximum - minimum, Number.EPSILON);
  const displayedTimeS = clamp(currentTimeS, 0, maximumTimeS || 0);
  const currentX = GEOMETRY.left + (displayedTimeS / timeSpan) * plotWidth;
  const referenceCurrent = interpolateMetric(referenceFinite, displayedTimeS, metric);
  const interruptedCurrent = interpolateMetric(interruptedFinite, displayedTimeS, metric);
  const yFor = (value: number) =>
    GEOMETRY.top + (1 - (value - minimum) / valueSpan) * plotHeight;
  const referencePath = useMemo(
    () => linePath(referenceFinite, metric, timeSpan, minimum, maximum),
    [maximum, metric, minimum, referenceFinite, timeSpan],
  );
  const interruptedPath = useMemo(
    () => linePath(interruptedFinite, metric, timeSpan, minimum, maximum),
    [interruptedFinite, maximum, metric, minimum, timeSpan],
  );
  const referenceArea = useMemo(
    () => areaPath(referenceFinite, metric, timeSpan, minimum, maximum),
    [maximum, metric, minimum, referenceFinite, timeSpan],
  );
  const interruptedArea = useMemo(
    () => areaPath(interruptedFinite, metric, timeSpan, minimum, maximum),
    [interruptedFinite, maximum, metric, minimum, timeSpan],
  );
  const summary = chartSummary(
    metric,
    displayedTimeS,
    referenceCurrent,
    interruptedCurrent,
    outage,
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const outageStartX = outage
    ? GEOMETRY.left + (clamp(outage.startS, 0, timeSpan) / timeSpan) * plotWidth
    : 0;
  const outageEndX = outage
    ? GEOMETRY.left + (clamp(outage.endS, 0, timeSpan) / timeSpan) * plotWidth
    : 0;
  const outageWidth = Math.max(0, outageEndX - outageStartX);
  const currentLabelX = clamp(
    currentX,
    GEOMETRY.left + 27,
    GEOMETRY.left + plotWidth - 27,
  );

  return (
    <figure className={`mission-charts__chart mission-charts__chart--${metric.key}`}>
      <figcaption className="mission-charts__caption">
        <span className="mission-charts__title">{metric.title}</span>
        <span className="mission-charts__subtitle">{metric.subtitle}</span>
      </figcaption>
      <svg
        className="mission-charts__svg"
        viewBox={`0 0 ${GEOMETRY.width} ${GEOMETRY.height}`}
        width="100%"
        height="auto"
        style={{ display: "block" }}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={titleId}>{metric.title}</title>
        <desc id={descriptionId}>{summary}</desc>
        <defs>
          <clipPath id={clipId}>
            <rect
              x={GEOMETRY.left}
              y={GEOMETRY.top}
              width={plotWidth}
              height={plotHeight}
            />
          </clipPath>
          <linearGradient
            id={referenceFillId}
            x1="0"
            x2="0"
            y1={GEOMETRY.top}
            y2={GEOMETRY.top + plotHeight}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor={CYAN} stopOpacity="0.2" />
            <stop offset="0.72" stopColor={CYAN} stopOpacity="0.035" />
            <stop offset="1" stopColor={CYAN} stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id={interruptedFillId}
            x1="0"
            x2="0"
            y1={GEOMETRY.top}
            y2={GEOMETRY.top + plotHeight}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor={AMBER} stopOpacity="0.12" />
            <stop offset="0.72" stopColor={AMBER} stopOpacity="0.025" />
            <stop offset="1" stopColor={AMBER} stopOpacity="0" />
          </linearGradient>
          <pattern
            id={outagePatternId}
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <line x1="0" x2="0" y1="0" y2="7" stroke={AMBER} strokeOpacity="0.16" strokeWidth="1" />
          </pattern>
        </defs>

        <rect
          className="mission-charts__plot-frame"
          x={GEOMETRY.left}
          y={GEOMETRY.top}
          width={plotWidth}
          height={plotHeight}
          rx="2"
          aria-hidden="true"
        />

        <g className="mission-charts__grid" aria-hidden="true">
          {ticks.map((tick) => {
            const x = GEOMETRY.left + tick * plotWidth;
            const y = GEOMETRY.top + tick * plotHeight;
            return (
              <g key={tick}>
                <line
                  x1={x}
                  x2={x}
                  y1={GEOMETRY.top}
                  y2={GEOMETRY.top + plotHeight}
                  stroke={GRID}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={GEOMETRY.left}
                  x2={GEOMETRY.left + plotWidth}
                  y1={y}
                  y2={y}
                  stroke={GRID}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </g>

        {outage && outageWidth > 0 ? (
          <g className="mission-charts__outage" aria-hidden="true" clipPath={`url(#${clipId})`}>
            <rect
              x={outageStartX}
              y={GEOMETRY.top}
              width={outageWidth}
              height={plotHeight}
              fill={AMBER}
              opacity="0.055"
            />
            <rect
              x={outageStartX}
              y={GEOMETRY.top}
              width={outageWidth}
              height={plotHeight}
              fill={`url(#${outagePatternId})`}
            />
            <line
              x1={outageStartX}
              x2={outageStartX}
              y1={GEOMETRY.top}
              y2={GEOMETRY.top + plotHeight}
              stroke={AMBER}
              opacity="0.42"
              strokeDasharray="3 5"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={outageEndX}
              x2={outageEndX}
              y1={GEOMETRY.top}
              y2={GEOMETRY.top + plotHeight}
              stroke={AMBER}
              opacity="0.42"
              strokeDasharray="3 5"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ) : null}

        <g className="mission-charts__axes" aria-hidden="true">
          {ticks.map((tick) => {
            const x = GEOMETRY.left + tick * plotWidth;
            const time = tick * maximumTimeS;
            const value = maximum - tick * valueSpan;
            return (
              <g key={tick}>
                <text
                  x={GEOMETRY.left - 12}
                  y={GEOMETRY.top + tick * plotHeight + 4}
                  textAnchor="end"
                  fill={LABEL}
                  fontSize="10"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {formatAxisValue(value, valueSpan)}
                </text>
                <text
                  x={x}
                  y={GEOMETRY.top + plotHeight + 20}
                  textAnchor="middle"
                  fill={LABEL}
                  fontSize="10"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {timeLabel(time, maximumTimeS)}
                </text>
              </g>
            );
          })}
          <text
            x={GEOMETRY.left - 10}
            y={13}
            textAnchor="end"
            fill={LABEL}
            fontSize="10"
            fontWeight="600"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {metric.unit}
          </text>
          <text
            x={GEOMETRY.left + plotWidth / 2}
            y={GEOMETRY.height - 5}
            textAnchor="middle"
            fill={LABEL}
            fontSize="10"
            fontWeight="600"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            MISSION TIME (DAYS)
          </text>
        </g>

        <g className="mission-charts__series" clipPath={`url(#${clipId})`}>
          {referenceArea ? (
            <path
              className="mission-charts__area mission-charts__area--reference"
              d={referenceArea}
              fill={`url(#${referenceFillId})`}
            />
          ) : null}
          {interruptedArea ? (
            <path
              className="mission-charts__area mission-charts__area--interrupted"
              d={interruptedArea}
              fill={`url(#${interruptedFillId})`}
            />
          ) : null}
          {referencePath ? (
            <path
              className="mission-charts__line mission-charts__line--reference"
              d={referencePath}
              fill="none"
              stroke={CYAN}
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {interruptedPath ? (
            <path
              className="mission-charts__line mission-charts__line--interrupted"
              d={interruptedPath}
              fill="none"
              stroke={AMBER}
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="8 6"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <line
            className="mission-charts__current-time"
            x1={currentX}
            x2={currentX}
            y1={GEOMETRY.top}
            y2={GEOMETRY.top + plotHeight}
            stroke={CURRENT}
            strokeWidth="0.9"
            strokeDasharray="2 5"
            vectorEffect="non-scaling-stroke"
          />
          {referenceCurrent !== null ? (
            <circle
              cx={currentX}
              cy={yFor(referenceCurrent)}
              r="3.2"
              fill="#ffffff"
              stroke={CYAN}
              strokeWidth="1.8"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {interruptedCurrent !== null ? (
            <circle
              cx={currentX}
              cy={yFor(interruptedCurrent)}
              r="3.2"
              fill="#ffffff"
              stroke={AMBER}
              strokeWidth="1.8"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </g>
        <g className="mission-charts__current-readout" aria-hidden="true">
          <path
            d={`M${currentX - 3.5},${GEOMETRY.top} L${currentX + 3.5},${GEOMETRY.top} L${currentX},${GEOMETRY.top + 5} Z`}
          />
          <rect x={currentLabelX - 24} y="3" width="48" height="15" rx="7.5" />
          <text x={currentLabelX} y="13.5" textAnchor="middle">
            DAY {timeLabel(displayedTimeS, maximumTimeS)}
          </text>
        </g>
      </svg>
      <p className="mission-charts__summary">{summary}</p>
    </figure>
  );
}

export function MissionCharts({
  reference,
  interrupted,
  currentTimeS,
  outage,
  className = "",
}: MissionChartsProps) {
  const maximumTimeS = useMemo(() => {
    let maximum = 0;
    for (const sample of reference) {
      if (Number.isFinite(sample.timeS)) maximum = Math.max(maximum, sample.timeS);
    }
    for (const sample of interrupted) {
      if (Number.isFinite(sample.timeS)) maximum = Math.max(maximum, sample.timeS);
    }
    return maximum;
  }, [interrupted, reference]);
  const hasData = reference.length > 0 || interrupted.length > 0;

  if (!hasData) {
    return (
      <section
        className={`mission-charts mission-charts--empty ${className}`.trim()}
        aria-label="Mission comparison charts"
      >
        <p className="mission-charts__empty-state">
          Run a comparison to populate altitude, propellant, and thrust charts.
        </p>
      </section>
    );
  }

  return (
    <section
      className={`mission-charts ${className}`.trim()}
      aria-label="Mission comparison charts"
    >
      <div className="mission-charts__legend" aria-label="Chart legend">
        <span className="mission-charts__legend-item mission-charts__legend-item--reference">
          Reference · cyan solid
        </span>
        <span className="mission-charts__legend-item mission-charts__legend-item--interrupted">
          Interrupted · amber dashed
        </span>
        {outage ? (
          <span className="mission-charts__legend-item mission-charts__legend-item--outage">
            Engine interruption · shaded
          </span>
        ) : null}
      </div>
      <div className="mission-charts__grid">
        {METRICS.map((metric) => (
          <MetricChart
            key={metric.key}
            metric={metric}
            reference={reference}
            interrupted={interrupted}
            currentTimeS={currentTimeS}
            maximumTimeS={maximumTimeS}
            outage={outage}
          />
        ))}
      </div>
    </section>
  );
}

export default MissionCharts;
