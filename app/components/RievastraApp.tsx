"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "../../lib/site-config";
import { SimulatorApp } from "./SimulatorApp";
import { SurfaceStudio } from "./SurfaceStudio";

type Workspace = "orbital" | "surface";

export function RievastraApp() {
  const [workspace, setWorkspace] = useState<Workspace>("orbital");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.location.hash.startsWith("#surface")) setWorkspace("surface");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const switchWorkspace = (next: Workspace) => {
    setWorkspace(next);
    const hash = next === "surface" ? "#surface-studio" : "#orbital-flight";
    window.history.replaceState(null, "", hash);
    window.requestAnimationFrame(() => {
      document.getElementById(next === "surface" ? "surface-studio" : "orbital-flight")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const contextualLinks =
    workspace === "orbital"
      ? [
          ["Mission", "#mission"],
          ["Compare", "#compare"],
          ["Technology", "#technology"],
          ["Physics", "#physics"],
          ["Validation", "#validation"],
        ]
      : [
          ["Collection", "#surface-collection"],
          ["Configurator", "#surface-configurator"],
          ["Compatibility", "#surface-compatibility"],
          ["Research", "#surface-research"],
        ];

  return (
    <div className={`app-frame app-frame--${workspace}`}>
      <a
        className="skip-link app-skip-link"
        href={workspace === "surface" ? "#surface-configurator" : "#mission"}
      >
        Skip to active laboratory
      </a>
      <header className="global-header">
        <button
          className="global-brand"
          type="button"
          aria-label={`${siteConfig.name} — open Orbital Flight`}
          onClick={() => switchWorkspace("orbital")}
        >
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>
            <strong>{siteConfig.wordmark}</strong>
            <small>{siteConfig.descriptor}</small>
          </span>
        </button>

        <nav className="workspace-switcher" aria-label="Laboratory sections">
          <button
            type="button"
            aria-pressed={workspace === "orbital"}
            aria-controls="orbital-flight"
            onClick={() => switchWorkspace("orbital")}
          >
            <span aria-hidden="true">01</span>
            <strong>Orbital Flight</strong>
            <small>Low-thrust simulator</small>
          </button>
          <button
            type="button"
            aria-pressed={workspace === "surface"}
            aria-controls="surface-studio"
            onClick={() => switchWorkspace("surface")}
          >
            <span aria-hidden="true">02</span>
            <strong>Surface Studio</strong>
            <small>Missionwear exhibition</small>
          </button>
        </nav>

        <div className="global-header-note">
          <span aria-hidden="true" />
          Independent concept lab
        </div>
      </header>

      <nav className="context-nav" aria-label={`${workspace === "orbital" ? "Orbital Flight" : "Surface Studio"} page navigation`}>
        {contextualLinks.map(([label, href]) => (
          <a key={href} href={href}>{label}</a>
        ))}
      </nav>

      <div
        className="workspace-panel workspace-panel--orbital"
        id="orbital-flight"
        hidden={workspace !== "orbital"}
      >
        <SimulatorApp />
      </div>
      <div
        className="workspace-panel workspace-panel--surface"
        id="surface-studio"
        hidden={workspace !== "surface"}
      >
        <SurfaceStudio active={workspace === "surface"} />
      </div>
    </div>
  );
}
