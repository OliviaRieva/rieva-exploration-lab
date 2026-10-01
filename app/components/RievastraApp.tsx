"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "../../lib/site-config";
import { BlackHoleLab } from "./BlackHoleLab";
import { HomePortal, type PortalDestination } from "./HomePortal";
import { SimulatorApp } from "./SimulatorApp";
import { SurfaceStudio } from "./SurfaceStudio";

type Workspace = "home" | PortalDestination;

const WORKSPACES: Array<{
  id: PortalDestination;
  index: string;
  title: string;
  description: string;
}> = [
  {
    id: "orbital",
    index: "01",
    title: "Orbital Flight",
    description: "Low-thrust simulator",
  },
  {
    id: "black-hole",
    index: "02",
    title: "Black Hole Lab",
    description: "Rotating spacetime",
  },
  {
    id: "surface",
    index: "03",
    title: "Surface Studio",
    description: "Missionwear exhibition",
  },
];

const WORKSPACE_HASH: Record<Workspace, string> = {
  home: "",
  orbital: "#orbital-flight",
  "black-hole": "#black-hole-laboratory",
  surface: "#surface-studio",
};

function workspaceFromHash(hash: string): Workspace {
  if (
    hash.startsWith("#orbital") ||
    ["#mission", "#compare", "#destinations", "#technology", "#physics", "#validation", "#references"].includes(hash)
  ) return "orbital";
  if (hash.startsWith("#black-hole")) return "black-hole";
  if (hash.startsWith("#surface")) return "surface";
  return "home";
}

export function RievastraApp() {
  const [workspace, setWorkspace] = useState<Workspace>("home");

  useEffect(() => {
    const readLocation = () => setWorkspace(workspaceFromHash(window.location.hash));
    const timer = window.setTimeout(readLocation, 0);
    window.addEventListener("popstate", readLocation);
    window.addEventListener("hashchange", readLocation);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", readLocation);
      window.removeEventListener("hashchange", readLocation);
    };
  }, []);

  const switchWorkspace = (next: Workspace) => {
    setWorkspace(next);
    const nextUrl = next === "home"
      ? `${window.location.pathname}${window.location.search}`
      : WORKSPACE_HASH[next];
    window.history.pushState(null, "", nextUrl);
    window.requestAnimationFrame(() => {
      const targetId = next === "home" ? "rievastra-home-title" : WORKSPACE_HASH[next].slice(1);
      document.getElementById(targetId)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  const contextualLinks: Array<[string, string]> =
    workspace === "orbital"
      ? [
          ["Mission", "#mission"],
          ["Compare", "#compare"],
          ["Destinations", "#destinations"],
          ["Technology", "#technology"],
          ["Physics", "#physics"],
          ["Validation", "#validation"],
        ]
      : workspace === "black-hole"
        ? [
            ["Experiment", "#black-hole-laboratory"],
            ["Physics", "#black-hole-physics"],
            ["Research", "#black-hole-research"],
          ]
        : workspace === "surface"
          ? [
              ["Collection", "#surface-collection"],
              ["Configurator", "#surface-configurator"],
              ["Test room", "#surface-test-room-title"],
              ["Compatibility", "#surface-compatibility"],
              ["Research", "#surface-research"],
            ]
          : [];

  const activeTitle = WORKSPACES.find((item) => item.id === workspace)?.title;
  const skipTarget = workspace === "orbital"
    ? "#mission"
    : workspace === "black-hole"
      ? "#black-hole-laboratory"
      : workspace === "surface"
        ? "#surface-configurator"
        : "#laboratory-choices";

  return (
    <div className={`app-frame app-frame--${workspace}`}>
      <a className="skip-link app-skip-link" href={skipTarget}>
        Skip to {workspace === "home" ? "laboratory choices" : "active laboratory"}
      </a>
      <header className="global-header">
        <button
          className="global-brand"
          type="button"
          aria-label={`${siteConfig.name} — open home`}
          onClick={() => switchWorkspace("home")}
        >
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>
            <strong>{siteConfig.wordmark}</strong>
            <small>{siteConfig.descriptor}</small>
          </span>
        </button>

        <nav className="workspace-switcher" aria-label="Laboratory sections">
          {WORKSPACES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={workspace === item.id}
              aria-controls={WORKSPACE_HASH[item.id].slice(1)}
              onClick={() => switchWorkspace(item.id)}
            >
              <span aria-hidden="true">{item.index}</span>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </nav>

        <div className="global-header-note">
          <span aria-hidden="true" />
          Independent concept lab
        </div>
      </header>

      {contextualLinks.length > 0 ? (
        <nav className="context-nav" aria-label={`${activeTitle} page navigation`}>
          {contextualLinks.map(([label, href]) => (
            <a key={href} href={href}>{label}</a>
          ))}
        </nav>
      ) : null}

      {workspace === "home" ? <HomePortal onNavigate={switchWorkspace} /> : null}

      <div
        className="workspace-panel workspace-panel--orbital"
        id="orbital-flight"
        hidden={workspace !== "orbital"}
      >
        <SimulatorApp active={workspace === "orbital"} />
      </div>
      <div
        className="workspace-panel workspace-panel--black-hole"
        id="black-hole-laboratory"
        hidden={workspace !== "black-hole"}
      >
        <BlackHoleLab active={workspace === "black-hole"} />
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
