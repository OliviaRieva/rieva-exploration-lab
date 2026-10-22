"use client";

import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { siteConfig } from "../../lib/site-config";
import {
  HomePortal,
  RievaMark,
  RievaWordmark,
  type PortalDestination,
} from "./HomePortal";
import styles from "./RievaApp.module.css";

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
  {
    id: "contact",
    index: "04",
    title: "Contact Flight",
    description: "Airflow + life search",
  },
];

const WORKSPACE_HASH: Record<Workspace, string> = {
  home: "",
  orbital: "#orbital-flight",
  "black-hole": "#black-hole-laboratory",
  surface: "#surface-studio",
  contact: "#contact-flight-laboratory",
};

type LaboratoryComponent = ComponentType<{ active?: boolean }>;
type LaboratoryLoader = () => Promise<{ default: LaboratoryComponent }>;

const LABORATORY_LOADERS = {
  orbital: () =>
    import("./SimulatorApp").then(({ SimulatorApp }) => ({ default: SimulatorApp })),
  "black-hole": () =>
    import("./BlackHoleLab").then(({ BlackHoleLab }) => ({ default: BlackHoleLab })),
  surface: () =>
    import("./SurfaceStudio").then(({ SurfaceStudio }) => ({ default: SurfaceStudio })),
  contact: () =>
    import("./ContactFlightLab").then(({ ContactFlightLab }) => ({
      default: ContactFlightLab,
    })),
} satisfies Record<PortalDestination, LaboratoryLoader>;

const LAZY_LABORATORIES: Record<PortalDestination, LaboratoryComponent> = {
  orbital: lazy(LABORATORY_LOADERS.orbital),
  "black-hole": lazy(LABORATORY_LOADERS["black-hole"]),
  surface: lazy(LABORATORY_LOADERS.surface),
  contact: lazy(LABORATORY_LOADERS.contact),
};

function preloadLaboratory(destination: PortalDestination) {
  void LABORATORY_LOADERS[destination]().catch(() => {
    // The visible error boundary reports an import failure if the user opens it.
  });
}

interface PendingNavigation {
  workspace: Workspace;
  hash: string;
  focus: boolean;
}

interface WorkspaceBoundaryProps {
  id: PortalDestination;
  title: string;
  onError: () => void;
  onReturnHome: () => void;
  children: ReactNode;
}

class WorkspaceBoundary extends Component<
  WorkspaceBoundaryProps,
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Unable to open ${this.props.title}`, error, info.componentStack);
    this.props.onError();
  }

  render() {
    if (!this.state.error) return this.props.children;
    const titleId = `${this.props.id}-load-error-title`;
    return (
      <section className={styles.errorState} role="alert" aria-labelledby={titleId}>
        <span className={styles.errorCode}>Laboratory unavailable</span>
        <h2 id={titleId}>{this.props.title} could not finish loading.</h2>
        <p>
          The rest of RIEVA is still available. Reload this laboratory to retry its
          code and 3D resources, or return to the home portal.
        </p>
        <div className={styles.errorActions}>
          <button type="button" onClick={() => window.location.reload()}>
            Reload laboratory
          </button>
          <button type="button" onClick={this.props.onReturnHome}>
            Return home
          </button>
        </div>
      </section>
    );
  }
}

function WorkspaceLoading({ index, title }: { index: string; title: string }) {
  return (
    <section className={styles.loadingState} role="status" aria-live="polite">
      <span className={styles.loadingIndex}>{index}</span>
      <span className={styles.loadingInstrument} aria-hidden="true">
        <i /><i /><i />
      </span>
      <div>
        <strong>Preparing {title}</strong>
        <span>Loading the laboratory code and interactive instruments…</span>
      </div>
    </section>
  );
}

function WorkspaceMount({
  workspace,
  active,
  onReady,
  children,
}: {
  workspace: PortalDestination;
  active: boolean;
  onReady: (workspace: PortalDestination) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    onReady(workspace);
  }, [active, onReady, workspace]);

  return children;
}

function workspaceFromHash(hash: string): Workspace {
  if (
    hash.startsWith("#orbital") ||
    ["#mission", "#compare", "#destinations", "#technology", "#physics", "#validation", "#references"].includes(hash)
  ) return "orbital";
  if (hash.startsWith("#black-hole")) return "black-hole";
  if (hash.startsWith("#surface")) return "surface";
  if (hash.startsWith("#contact")) return "contact";
  return "home";
}

export function RievaApp() {
  const [workspace, setWorkspace] = useState<Workspace>("home");
  const [visitedWorkspaces, setVisitedWorkspaces] = useState<Set<PortalDestination>>(
    () => new Set(),
  );
  const [readyWorkspaces, setReadyWorkspaces] = useState<Set<PortalDestination>>(
    () => new Set(),
  );
  const [failedWorkspaces, setFailedWorkspaces] = useState<Set<PortalDestination>>(
    () => new Set(),
  );
  const workspaceRef = useRef<Workspace>("home");
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const focusFrameRef = useRef<number | null>(null);

  const rememberWorkspace = useCallback((destination: PortalDestination) => {
    preloadLaboratory(destination);
    setVisitedWorkspaces((current) => {
      if (current.has(destination)) return current;
      const next = new Set(current);
      next.add(destination);
      return next;
    });
  }, []);

  const completeWorkspaceNavigation = useCallback((readyWorkspace: Workspace) => {
    const pending = pendingNavigationRef.current;
    if (!pending || pending.workspace !== readyWorkspace) return;
    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current);
    }
    focusFrameRef.current = window.requestAnimationFrame(() => {
      const latest = pendingNavigationRef.current;
      if (!latest || latest !== pending || latest.workspace !== readyWorkspace) return;

      const rootId =
        readyWorkspace === "home"
          ? "rieva-home-title"
          : WORKSPACE_HASH[readyWorkspace].slice(1);
      const root = document.getElementById(rootId);
      let requestedTarget: HTMLElement | null = null;
      if (pending.hash.startsWith("#") && pending.hash.length > 1) {
        try {
          requestedTarget = document.getElementById(
            decodeURIComponent(pending.hash.slice(1)),
          );
        } catch {
          requestedTarget = null;
        }
      }
      (requestedTarget ?? root)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });

      if (pending.focus) {
        const workspaceRoot =
          readyWorkspace === "home"
            ? root
            : document.getElementById(WORKSPACE_HASH[readyWorkspace].slice(1));
        const heading = workspaceRoot?.querySelector<HTMLElement>("h1") ?? root;
        if (heading) {
          heading.setAttribute("tabindex", "-1");
          heading.focus({ preventScroll: true });
        }
      }
      if (pendingNavigationRef.current === pending) pendingNavigationRef.current = null;
      focusFrameRef.current = null;
    });
  }, []);

  const handleWorkspaceReady = useCallback(
    (destination: PortalDestination) => {
      setReadyWorkspaces((current) => {
        if (current.has(destination)) return current;
        const next = new Set(current);
        next.add(destination);
        return next;
      });
      setFailedWorkspaces((current) => {
        if (!current.has(destination)) return current;
        const next = new Set(current);
        next.delete(destination);
        return next;
      });
      completeWorkspaceNavigation(destination);
    },
    [completeWorkspaceNavigation],
  );

  const handleWorkspaceError = useCallback((destination: PortalDestination) => {
    setFailedWorkspaces((current) => {
      if (current.has(destination)) return current;
      const next = new Set(current);
      next.add(destination);
      return next;
    });
  }, []);

  const switchWorkspace = useCallback(
    (next: Workspace) => {
      const nextHash = next === "home" ? "" : WORKSPACE_HASH[next];
      pendingNavigationRef.current = {
        workspace: next,
        hash: nextHash,
        focus: true,
      };
      if (next !== "home") rememberWorkspace(next);

      workspaceRef.current = next;
      setWorkspace(next);

      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const nextUrl =
        next === "home"
          ? `${window.location.pathname}${window.location.search}`
          : `${window.location.pathname}${window.location.search}${nextHash}`;
      if (currentUrl !== nextUrl) {
        window.history.pushState(null, "", next === "home" ? nextUrl : nextHash);
      }

      if (next === "home" || readyWorkspaces.has(next)) {
        completeWorkspaceNavigation(next);
      }
    },
    [completeWorkspaceNavigation, readyWorkspaces, rememberWorkspace],
  );

  useEffect(() => {
    let firstLocationRead = true;
    const readLocation = () => {
      const next = workspaceFromHash(window.location.hash);
      if (next === workspaceRef.current) {
        firstLocationRead = false;
        return;
      }

      if (next !== "home") rememberWorkspace(next);
      pendingNavigationRef.current = {
        workspace: next,
        hash: window.location.hash || WORKSPACE_HASH[next],
        focus: !firstLocationRead,
      };
      workspaceRef.current = next;
      setWorkspace(next);
      firstLocationRead = false;
    };

    const timer = window.setTimeout(readLocation, 0);
    window.addEventListener("popstate", readLocation);
    window.addEventListener("hashchange", readLocation);
    return () => {
      window.clearTimeout(timer);
      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current);
      }
      window.removeEventListener("popstate", readLocation);
      window.removeEventListener("hashchange", readLocation);
    };
  }, [rememberWorkspace]);

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
          : workspace === "contact"
            ? [
                ["Flight lab", "#contact-flight-laboratory"],
                ["Aerodynamics", "#contact-aerodynamics"],
                ["Systems", "#contact-systems"],
                ["Research", "#contact-research"],
              ]
          : [];

  const activeTitle = WORKSPACES.find((item) => item.id === workspace)?.title;
  const activeLaboratoryReady =
    workspace === "home" || readyWorkspaces.has(workspace);
  const skipTarget =
    workspace === "home" ? "#laboratory-choices" : WORKSPACE_HASH[workspace];

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
          <RievaMark compact />
          <span>
            <RievaWordmark compact />
            <small>{siteConfig.descriptor}</small>
          </span>
        </button>

        <nav className="workspace-switcher" aria-label="Laboratory sections">
          {WORKSPACES.map((item) => {
            const loadState = failedWorkspaces.has(item.id)
              ? "error"
              : readyWorkspaces.has(item.id)
                ? "ready"
                : visitedWorkspaces.has(item.id)
                  ? "loading"
                  : "idle";
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={workspace === item.id}
                aria-busy={workspace === item.id && loadState === "loading" ? "true" : undefined}
                aria-controls={WORKSPACE_HASH[item.id].slice(1)}
                data-load-state={loadState}
                onPointerEnter={() => preloadLaboratory(item.id)}
                onPointerDown={() => preloadLaboratory(item.id)}
                onFocus={() => preloadLaboratory(item.id)}
                onClick={() => switchWorkspace(item.id)}
              >
                <span aria-hidden="true">{item.index}</span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </button>
            );
          })}
        </nav>

        <div className="global-header-note">
          <span aria-hidden="true" />
          Independent concept lab
        </div>
      </header>

      {contextualLinks.length > 0 && activeLaboratoryReady ? (
        <nav className="context-nav" aria-label={`${activeTitle} page navigation`}>
          {contextualLinks.map(([label, href]) => (
            <a key={href} href={href}>{label}</a>
          ))}
        </nav>
      ) : null}

      {workspace === "home" ? (
        <HomePortal
          onNavigate={switchWorkspace}
          onPreload={preloadLaboratory}
          onReady={() => completeWorkspaceNavigation("home")}
        />
      ) : null}

      {WORKSPACES.map((item) => {
        const Laboratory = LAZY_LABORATORIES[item.id];
        const visited = visitedWorkspaces.has(item.id);
        const failed = failedWorkspaces.has(item.id);
        return (
          <div
            className={`workspace-panel workspace-panel--${item.id}`}
            id={WORKSPACE_HASH[item.id].slice(1)}
            key={item.id}
            hidden={workspace !== item.id}
            tabIndex={-1}
            aria-label={`${item.title} laboratory workspace`}
            aria-busy={workspace === item.id && visited && !readyWorkspaces.has(item.id) && !failed ? "true" : undefined}
          >
            {visited ? (
              <WorkspaceBoundary
                id={item.id}
                title={item.title}
                onError={() => handleWorkspaceError(item.id)}
                onReturnHome={() => switchWorkspace("home")}
              >
                <Suspense fallback={<WorkspaceLoading index={item.index} title={item.title} />}>
                  <WorkspaceMount
                    workspace={item.id}
                    active={workspace === item.id}
                    onReady={handleWorkspaceReady}
                  >
                    <Laboratory active={workspace === item.id} />
                  </WorkspaceMount>
                </Suspense>
              </WorkspaceBoundary>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
