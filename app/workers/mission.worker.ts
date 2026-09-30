import {
  SimulationInputError,
  simulateMissionComparison,
  type ComparisonResult,
  type MissionParameters,
  type SolverSettings,
  type ValidationIssue,
} from "../../lib/simulation";

export interface MissionWorkerRunRequest {
  type: "RUN";
  requestId: string;
  parameters: MissionParameters;
  settings?: Partial<SolverSettings>;
}

export interface MissionWorkerPingRequest {
  type: "PING";
  requestId: string;
}

export type MissionWorkerRequest =
  | MissionWorkerRunRequest
  | MissionWorkerPingRequest;

export type MissionWorkerResponse =
  | { type: "READY"; requestId: string }
  | { type: "PROGRESS"; requestId: string; fraction: number }
  | { type: "RESULT"; requestId: string; result: ComparisonResult }
  | {
      type: "ERROR";
      requestId: string;
      message: string;
      issues: ValidationIssue[];
    };

interface WorkerScope {
  postMessage(message: MissionWorkerResponse): void;
  onmessage: ((event: MessageEvent<MissionWorkerRequest>) => void) | null;
}

const workerScope = globalThis as unknown as WorkerScope;

function post(response: MissionWorkerResponse): void {
  workerScope.postMessage(response);
}

workerScope.onmessage = (event: MessageEvent<MissionWorkerRequest>): void => {
  const request = event.data;
  if (!request || typeof request.requestId !== "string") return;

  if (request.type === "PING") {
    post({ type: "READY", requestId: request.requestId });
    return;
  }

  if (request.type !== "RUN") return;

  try {
    const result = simulateMissionComparison(
      request.parameters,
      request.settings,
      (fraction) => {
        post({
          type: "PROGRESS",
          requestId: request.requestId,
          fraction,
        });
      },
    );
    post({ type: "RESULT", requestId: request.requestId, result });
  } catch (error: unknown) {
    const issues = error instanceof SimulationInputError ? error.issues : [];
    const message =
      error instanceof Error ? error.message : "Unknown simulation error.";
    post({
      type: "ERROR",
      requestId: request.requestId,
      message,
      issues,
    });
  }
};

export {};
