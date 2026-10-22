"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { siteConfig } from "../../lib/site-config";
import styles from "./HomePortal.module.css";

export type PortalDestination = "orbital" | "black-hole" | "surface" | "contact";

export interface HomePortalProps {
  onNavigate: (destination: PortalDestination) => void;
  onPreload?: (destination: PortalDestination) => void;
  onReady?: () => void;
}

type PortalDefinition = {
  destination: PortalDestination;
  index: string;
  title: string;
  kicker: string;
  description: string;
  className: string;
};

const PORTALS: PortalDefinition[] = [
  {
    destination: "orbital",
    index: "01",
    title: "Orbital Flight",
    kicker: "Propulsion + trajectories",
    description: "Shape a low-thrust transfer, interrupt the engine, and read the orbit that follows.",
    className: styles.orbitalPortal,
  },
  {
    destination: "black-hole",
    index: "02",
    title: "Black Hole Lab",
    kicker: "Gravity + light",
    description: "Explore rotating spacetime, photon paths, and the boundaries where missions fail.",
    className: styles.blackHolePortal,
  },
  {
    destination: "surface",
    index: "03",
    title: "Surface Studio",
    kicker: "Missionwear + mobility",
    description: "Compose a surface system, inspect every layer, and test environmental tradeoffs.",
    className: styles.surfacePortal,
  },
  {
    destination: "contact",
    index: "04",
    title: "Contact Flight",
    kicker: "Airflow + astrobiology",
    description: "Shape a research aircraft, reveal its airflow, and map evidence in the search for life.",
    className: styles.contactPortal,
  },
];

const STAR_POINTS = [
  [8, 19], [14, 62], [22, 34], [29, 82], [36, 13], [43, 69], [51, 27], [58, 88],
  [65, 7], [72, 47], [79, 76], [86, 23], [92, 58], [5, 91], [18, 6], [33, 51],
  [47, 94], [62, 38], [75, 15], [95, 87],
] as const;

const PORTAL_TRANSITION_MS = 1240;

export function RievaMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`${styles.brandSymbol} ${compact ? styles.brandSymbolCompact : ""}`}
      aria-hidden="true"
    >
      <span className={styles.brandCore}>R</span>
      <span className={styles.brandOrbit} />
      <span className={styles.brandPlanetTrack}>
        <span className={styles.brandPlanet} />
      </span>
    </span>
  );
}

export function RievaWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`${styles.brandWord} ${compact ? styles.brandWordCompact : ""}`}
      role="img"
      aria-label="RIEVA"
    >
      <span aria-hidden="true">RIEV</span>
      <span className={styles.brandA} aria-hidden="true">
        <span className={styles.brandADot} />
      </span>
    </span>
  );
}

function OrbitalVehicle({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`${styles.orbitVehicle} ${className}`.trim()}
      viewBox="0 0 72 34"
      focusable="false"
      aria-hidden="true"
    >
      <path className={styles.vehiclePlumeOuter} d="M10 17 0 11v12Z" />
      <path className={styles.vehiclePlumeInner} d="M11 17 3 14v6Z" />
      <path className={styles.vehiclePanel} d="M27 3 49 1l3 8-23 3ZM27 31l22 2 3-8-23-3Z" />
      <path className={styles.vehiclePanelGrid} d="M34 4v6m7-7v6m-7 15v6m7-5v6" />
      <path className={styles.vehicleBody} d="M10 17 20 8h29l16 9-16 9H20Z" />
      <path className={styles.vehicleNose} d="m49 8 18 9-18 9 7-9Z" />
      <path className={styles.vehicleDetail} d="M20 11h27l8 6-8 6H20m2-12v12" />
    </svg>
  );
}

function OrbitArtwork() {
  return (
    <span className={`${styles.visual} ${styles.orbitVisual}`} aria-hidden="true">
      <svg className={styles.orbitDiagram} viewBox="0 0 280 170" focusable="false">
        <ellipse className={styles.orbitGuideSecondary} cx="140" cy="79" rx="67" ry="59" />
        <ellipse className={styles.orbitGuidePrimary} cx="140" cy="83" rx="112" ry="43" />
        <circle className={styles.planetAtmosphere} cx="140" cy="82" r="44" />
        <circle className={styles.planetBody} cx="140" cy="82" r="38" />
        <path className={styles.planetTerminator} d="M151 45c17 12 24 31 17 48-7 18-25 28-44 26 14-7 24-19 27-34 3-15 1-28 0-40Z" />
        <path className={styles.planetGrid} d="M104 82h72M111 62c17 7 41 7 58 0m-58 40c17-7 41-7 58 0M140 44c-11 11-16 24-16 38s5 28 16 38m0-76c11 11 16 24 16 38s-5 28-16 38" />
        <path className={styles.orbitTelemetry} d="M23 84h10m214 0h10M139 18v9m0 111v9" />
      </svg>
      <span className={styles.orbitVehicleTrack}>
        <OrbitalVehicle />
      </span>
      <span className={styles.instrumentGlint} />
    </span>
  );
}

function BlackHoleArtwork() {
  return (
    <span className={`${styles.visual} ${styles.blackVisual}`} aria-hidden="true">
      <svg className={styles.blackDiagram} viewBox="0 0 280 170" focusable="false">
        <ellipse className={styles.lensingFieldOuter} cx="140" cy="82" rx="113" ry="53" />
        <ellipse className={styles.lensingFieldInner} cx="140" cy="82" rx="77" ry="68" />
        <path className={styles.accretionBackLine} d="M35 87C73 37 210 37 246 77" />
        <path className={styles.accretionCoolLine} d="M49 95C91 59 202 54 235 75" />
        <circle className={styles.blackCoreHalo} cx="140" cy="82" r="39" />
        <circle className={styles.blackCore} cx="140" cy="82" r="32" />
        <path className={styles.accretionFrontLine} d="M246 77C207 126 72 127 35 87" />
        <path className={styles.accretionHotLine} d="M234 75C190 111 80 113 49 95" />
        <path className={styles.blackAxis} d="M140 22v17m0 86v18" />
      </svg>
      <span className={styles.blackProbeTrack}>
        <span className={styles.blackProbe}>
          <i />
        </span>
      </span>
    </span>
  );
}

function SuitArtwork() {
  return (
    <span className={`${styles.visual} ${styles.suitVisual}`} aria-hidden="true">
      <svg className={styles.suitDiagram} viewBox="0 0 200 180" focusable="false">
        <ellipse className={styles.suitDatumRing} cx="100" cy="91" rx="77" ry="55" />
        <path className={`${styles.suitAssemblyPiece} ${styles.suitPack}`} d="M70 50 82 40h39l12 11 5 70-22 13H81l-20-14Z" />
        <path className={`${styles.suitAssemblyPiece} ${styles.suitHelmet}`} d="M72 34C73 12 86 4 101 4c17 0 30 9 31 30l-10 17H82Z" />
        <path className={styles.suitVisor} d="M79 30c2-13 10-19 22-19 13 0 22 7 24 20l-8 11H87Z" />
        <path className={`${styles.suitAssemblyPiece} ${styles.suitTorso}`} d="M74 49 88 43h27l14 8 10 52-18 25H80l-18-25Z" />
        <path className={styles.suitChestPanel} d="m84 58 17-6 18 6-3 28-15 8-16-8Z" />
        <path className={`${styles.suitAssemblyPiece} ${styles.suitArmLeft}`} d="m69 54-14 6-14 35 4 30 13 2 5-27 14-30Z" />
        <path className={`${styles.suitAssemblyPiece} ${styles.suitArmRight}`} d="m132 54 14 6 14 35-4 30-13 2-5-27-14-30Z" />
        <path className={`${styles.suitAssemblyPiece} ${styles.suitLegLeft}`} d="m80 121-2 34-8 17 7 5 19-2 5-20-2-34Z" />
        <path className={`${styles.suitAssemblyPiece} ${styles.suitLegRight}`} d="m121 121 2 34 8 17-7 5-19-2-5-20 2-34Z" />
        <path className={styles.suitJointLine} d="M52 94h13m70 0h13M82 127l17 3m20-3-17 3M83 72h36M101 94v28" />
        <path className={styles.suitSeamLine} d="M88 45 82 72l5 39m27-66 6 27-5 39M49 91l12 5m90-5-12 5" />
      </svg>
      <span className={styles.suitScan} />
      <span className={styles.suitIndex}>03</span>
    </span>
  );
}

function ContactArtwork() {
  return (
    <span className={`${styles.visual} ${styles.contactVisual}`} aria-hidden="true">
      <svg className={styles.contactFlow} viewBox="0 0 260 150" focusable="false">
        <path d="M5 28C61 8 170 9 255 38" />
        <path d="M2 53c69-19 168-14 256 5" />
        <path d="M2 93c71 18 169 17 256-5" />
        <path d="M5 120c58 20 170 17 250-14" />
      </svg>
      <svg className={styles.contactAircraft} viewBox="0 0 260 150" focusable="false">
        <path
          className={styles.contactAircraftShadow}
          d="m9 81 80-17 28-42 26 2 14 31 64-15 31 10-48 26 39 33-17 9-72-26-14 39-25-1-28-37-75 1Z"
        />
        <path
          className={styles.contactAircraftBody}
          d="m10 74 80-15 29-38 22 2 15 31 64-13 29 10-49 23 38 29-14 8-72-24-14 38-20-1-29-36-74-1Z"
        />
        <path className={styles.contactAircraftCore} d="m89 59 67-5 44 20-48 13-63-28Z" />
        <path className={styles.contactAircraftCanopy} d="m118 56 10-26 8 1 13 28-15 10Z" />
        <path className={styles.contactAircraftIntake} d="m103 61 22 7-14 8-19-15m61-7-17 14 17 8 29-12" />
        <path className={styles.contactAircraftAccent} d="m26 76 65-12 61 17-63 2m69-24 59-13m-65 41 69 18" />
        <path className={styles.contactAircraftPanel} d="m67 64 23 23m89-38-27 38M119 21l19 104" />
        <path className={styles.contactAircraftNozzle} d="m222 44 27 7-20 8m-3 39 12 5-14 8" />
      </svg>
      <span className={styles.contactScan} />
      <span className={styles.contactSignal}>
        <span />
      </span>
    </span>
  );
}

function PortalArtwork({ destination }: { destination: PortalDestination }) {
  if (destination === "orbital") return <OrbitArtwork />;
  if (destination === "black-hole") return <BlackHoleArtwork />;
  if (destination === "surface") return <SuitArtwork />;
  return <ContactArtwork />;
}

export function HomePortal({ onNavigate, onPreload, onReady }: HomePortalProps) {
  const [departing, setDeparting] = useState<PortalDestination | null>(null);
  const [transitionOrigin, setTransitionOrigin] = useState({ x: 0, y: 0 });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const navigate = (destination: PortalDestination, source: HTMLButtonElement) => {
    if (departing) return;
    onPreload?.(destination);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onNavigate(destination);
      return;
    }

    const bounds = source.getBoundingClientRect();
    setTransitionOrigin({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height * 0.3,
    });
    setDeparting(destination);
    timerRef.current = window.setTimeout(() => onNavigate(destination), PORTAL_TRANSITION_MS);
  };

  const transitionStyle = {
    "--transition-x": `${transitionOrigin.x}px`,
    "--transition-y": `${transitionOrigin.y}px`,
  } as CSSProperties;

  return (
    <main
      className={styles.home}
      data-departing={departing ?? undefined}
      aria-labelledby="rieva-home-title"
      aria-busy={departing ? "true" : undefined}
      style={transitionStyle}
    >
      <div className={styles.sky} aria-hidden="true">
        {STAR_POINTS.map(([left, top], index) => (
          <span
            className={styles.star}
            key={`${left}-${top}`}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              animationDelay: `${(index % 7) * -0.67}s`,
            }}
          />
        ))}
        <span className={styles.prismOne} />
        <span className={styles.prismTwo} />
      </div>

      <section className={styles.hero}>
        <div className={styles.wordmark}>
          <RievaMark />
          <span className={styles.wordmarkType}>
            <RievaWordmark />
            <small>{siteConfig.descriptor}</small>
          </span>
        </div>
        <p className={styles.eyebrow}>Independent exploration systems laboratory</p>
        <h1 id="rieva-home-title" tabIndex={-1}>
          Design the journey.<br />
          <span>Test the edge.</span>
        </h1>
        <p className={styles.introduction}>
          Four interactive laboratories connect spacecraft dynamics, extreme-gravity physics,
          human surface systems, and atmospheric flight. Change the assumptions, watch each
          model respond, and keep evidence separate from imagination.
        </p>
        <p className={styles.invitation}>Choose a laboratory to begin.</p>
      </section>

      <nav
        className={styles.portalGrid}
        id="laboratory-choices"
        aria-label="Choose a RIEVA laboratory"
      >
        {PORTALS.map((portal) => {
          const isDeparting = departing === portal.destination;
          return (
            <button
              className={`${styles.portal} ${portal.className}`}
              data-active={isDeparting ? "true" : undefined}
              data-muted={departing && !isDeparting ? "true" : undefined}
              type="button"
              key={portal.destination}
              onPointerEnter={() => onPreload?.(portal.destination)}
              onPointerDown={() => onPreload?.(portal.destination)}
              onFocus={() => onPreload?.(portal.destination)}
              onClick={(event) => navigate(portal.destination, event.currentTarget)}
              aria-label={`Open ${portal.title}: ${portal.description}`}
              disabled={Boolean(departing && !isDeparting)}
            >
              <PortalArtwork destination={portal.destination} />
              <span className={styles.portalCopy}>
                <span className={styles.portalMeta}>
                  <span>{portal.index}</span>
                  <span>{portal.kicker}</span>
                </span>
                <strong>{portal.title}</strong>
                <span className={styles.portalDescription}>{portal.description}</span>
                <span className={styles.enterLabel}>
                  Enter laboratory <span aria-hidden="true">↗</span>
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <p className={styles.scopeNote}>
        Research-informed concepts · Explicit assumptions · No claim of flight certification
      </p>
      <span className={styles.srStatus} role="status" aria-live="polite">
        {departing ? `Opening ${PORTALS.find((portal) => portal.destination === departing)?.title}` : ""}
      </span>
      <div className={styles.departureWash} aria-hidden="true" />
      {departing ? (
        <div className={styles.transitionLayer} data-kind={departing} aria-hidden="true">
          {departing === "orbital" ? (
            <>
              <span className={styles.transitionOrbitGuide} />
              <span className={styles.transitionRocket}>
                <OrbitalVehicle className={styles.transitionVehicle} />
              </span>
            </>
          ) : null}
          {departing === "black-hole" ? (
            <span className={styles.transitionHole}>
              <span className={styles.transitionHoleGlow} />
              <span className={styles.transitionDisk} />
              <span className={styles.transitionHoleCore} />
              <span className={styles.transitionProbeTrack}>
                <span className={styles.transitionProbe} />
              </span>
            </span>
          ) : null}
          {departing === "surface" ? (
            <span className={styles.transitionSurface}>
              <SuitArtwork />
              <span className={styles.transitionSurfaceBloom} />
            </span>
          ) : null}
          {departing === "contact" ? (
            <span className={styles.transitionContact}>
              <ContactArtwork />
              <span className={styles.transitionContactWake} />
            </span>
          ) : null}
          <span className={styles.transitionCaption}>
            Entering {PORTALS.find((portal) => portal.destination === departing)?.title}
          </span>
        </div>
      ) : null}
    </main>
  );
}
