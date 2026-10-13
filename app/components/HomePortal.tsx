"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { siteConfig } from "../../lib/site-config";
import styles from "./HomePortal.module.css";

export type PortalDestination = "orbital" | "black-hole" | "surface" | "contact";

export interface HomePortalProps {
  onNavigate: (destination: PortalDestination) => void;
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

function OrbitArtwork() {
  return (
    <span className={styles.visual} aria-hidden="true">
      <span className={styles.orbitHalo} />
      <span className={styles.orbitPlanet}>
        <span className={styles.planetHighlight} />
      </span>
      <span className={`${styles.orbitTrack} ${styles.orbitTrackOuter}`} />
      <span className={`${styles.orbitTrack} ${styles.orbitTrackInner}`} />
      <span className={styles.orbitRunner}>
        <span className={styles.rocket}>
          <span className={styles.rocketNose} />
          <span className={styles.rocketBody} />
          <span className={styles.rocketWingLeft} />
          <span className={styles.rocketWingRight} />
          <span className={styles.rocketFlame} />
        </span>
      </span>
    </span>
  );
}

function BlackHoleArtwork() {
  return (
    <span className={styles.visual} aria-hidden="true">
      <span className={styles.blackHoleGlow} />
      <span className={`${styles.accretionDisk} ${styles.accretionDiskBack}`} />
      <span className={styles.blackHoleCore} />
      <span className={`${styles.accretionDisk} ${styles.accretionDiskFront}`} />
      <span className={styles.gravityArcOne} />
      <span className={styles.gravityArcTwo} />
      <span className={styles.probeOrbit}>
        <span className={styles.probe} />
      </span>
    </span>
  );
}

function SuitArtwork() {
  return (
    <span className={styles.visual} aria-hidden="true">
      <span className={styles.suitAura} />
      <span className={styles.suitFigure}>
        <span className={`${styles.suitPart} ${styles.suitPack}`} />
        <span className={`${styles.suitPart} ${styles.suitHelmet}`}>
          <span className={styles.suitVisor} />
        </span>
        <span className={`${styles.suitPart} ${styles.suitTorso}`}>
          <span className={styles.suitChestPanel} />
        </span>
        <span className={`${styles.suitPart} ${styles.suitArmLeft}`} />
        <span className={`${styles.suitPart} ${styles.suitArmRight}`} />
        <span className={`${styles.suitPart} ${styles.suitLegLeft}`} />
        <span className={`${styles.suitPart} ${styles.suitLegRight}`} />
        <span className={styles.suitScan} />
      </span>
      <span className={styles.assemblyRing} />
    </span>
  );
}

function ContactArtwork() {
  return (
    <span className={`${styles.visual} ${styles.contactVisual}`} aria-hidden="true">
      <svg className={styles.contactFlow} viewBox="0 0 260 150" focusable="false">
        <path d="M8 34 C72 8 178 13 250 40" />
        <path d="M3 58 C78 38 180 42 256 61" />
        <path d="M3 88 C70 108 180 107 256 84" />
        <path d="M8 113 C80 142 183 137 250 109" />
      </svg>
      <svg className={styles.contactAircraft} viewBox="0 0 260 150" focusable="false">
        <path
          className={styles.contactAircraftShadow}
          d="M15 83 94 68 120 22 142 24 151 60 223 45 250 56 191 78 236 103 222 112 151 91 137 134 116 132 94 91 20 94Z"
        />
        <path
          className={styles.contactAircraftBody}
          d="M16 75 96 64 121 27 140 29 149 58 220 48 246 57 187 75 230 98 218 105 149 87 136 125 118 124 96 87 21 87Z"
        />
        <path className={styles.contactAircraftCanopy} d="m119 62 9-25 8 2 7 23-9 8Z" />
        <path className={styles.contactAircraftCore} d="m96 64 53-6 38 17-38 12-53-23Z" />
        <path className={styles.contactAircraftAccent} d="m30 78 68-10 50 8-52 6Z" />
        <path className={styles.contactAircraftNozzle} d="m218 54 28 3-18 7Z" />
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

export function HomePortal({ onNavigate }: HomePortalProps) {
  const [departing, setDeparting] = useState<PortalDestination | null>(null);
  const [transitionOrigin, setTransitionOrigin] = useState({ x: 0, y: 0 });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const navigate = (destination: PortalDestination, source: HTMLButtonElement) => {
    if (departing) return;

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
        <h1 id="rieva-home-title">
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
                <span className={styles.rocket}>
                  <span className={styles.rocketNose} />
                  <span className={styles.rocketBody} />
                  <span className={styles.rocketWingLeft} />
                  <span className={styles.rocketWingRight} />
                  <span className={styles.rocketFlame} />
                </span>
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
