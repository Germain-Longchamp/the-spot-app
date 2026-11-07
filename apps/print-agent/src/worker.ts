import type { Logger } from "./logger";
import type { Printer, PrintOptions } from "./printer";

export type { Logger } from "./logger";

export interface ClaimedJob {
  jobId: string;
  attempt: number;
  storagePath: string;
}

export type JobReport = "DONE" | "FAILED";

/** The image is gone for good: retrying cannot help. */
export class ImageUnavailableError extends Error {}

export interface JobStore {
  /** Returns the next authorized job, or null when there is nothing to do. */
  claim(): Promise<ClaimedJob | null>;
  /** True while this attempt still owns the job. */
  isCurrent(job: ClaimedJob): Promise<boolean>;
  /** Throws ImageUnavailableError when missing, any other error if temporary. */
  downloadImage(storagePath: string): Promise<Buffer>;
  /** Throws only when the answer did not reach us. Returns the server's answer. */
  report(job: ClaimedJob, status: JobReport, detail?: string): Promise<string>;
  /** Signs of life for the agent and for the job it is working on, if any. */
  heartbeat(job: ClaimedJob | null): Promise<void>;
}

export interface WorkerDeps {
  store: JobStore;
  printer: Printer;
  log: Logger;
  sleep: (ms: number) => Promise<void>;
  printOptions: PrintOptions;
  /** The job being worked on right now, read by the heartbeat. */
  activeJob: { current: ClaimedJob | null };
  /** Tells the report loop to give up, so that the process can stop. */
  shouldStop: () => boolean;
  downloadAttempts: number;
  retryDelayMs: number;
  maxRetryDelayMs: number;
}

export type JobOutcome = "idle" | "done" | "failed" | "abandoned";

/** Sizes and margins depend on the paper, unknown until SCRUM-26. */
function prepareImage(image: Buffer): Buffer {
  if (image.length === 0) {
    throw new ImageUnavailableError("Image vide");
  }
  return image;
}

async function fetchImage(
  deps: WorkerDeps,
  job: ClaimedJob
): Promise<Buffer | { failure: string }> {
  for (let attempt = 1; attempt <= deps.downloadAttempts; attempt++) {
    try {
      return prepareImage(await deps.store.downloadImage(job.storagePath));
    } catch (error) {
      if (error instanceof ImageUnavailableError) {
        return {
          failure: `Image introuvable : ${error.message}`,
        };
      }
      deps.log.error(`job ${job.jobId}: échec du téléchargement ${attempt}`, {
        jobId: job.jobId,
      });
      if (attempt < deps.downloadAttempts) {
        await deps.sleep(deps.retryDelayMs);
      }
    }
  }
  return { failure: "Image impossible à télécharger" };
}

/**
 * Keeps trying until the server has heard the result: the print has happened
 * and a lost report would leave the job looking unprinted. A late DONE is
 * accepted by the server, so this is safe after the job went STUCK.
 */
async function reportResult(
  deps: WorkerDeps,
  job: ClaimedJob,
  status: JobReport,
  detail?: string
): Promise<void> {
  let delay = deps.retryDelayMs;
  while (true) {
    try {
      const answer = await deps.store.report(job, status, detail);
      deps.log.info(`job ${job.jobId}: ${status} -> ${answer}`, {
        jobId: job.jobId,
        reason: detail,
      });
      if (status === "FAILED") {
        deps.log.error(`job ${job.jobId}: impression en échec`, {
          jobId: job.jobId,
          reason: detail,
        });
      }
      return;
    } catch {
      deps.log.error(`job ${job.jobId}: compte rendu ${status} non transmis`, {
        jobId: job.jobId,
      });
      if (deps.shouldStop()) return;
      await deps.sleep(delay);
      delay = Math.min(delay * 2, deps.maxRetryDelayMs);
    }
  }
}

async function stillOwned(deps: WorkerDeps, job: ClaimedJob): Promise<boolean> {
  try {
    return await deps.store.isCurrent(job);
  } catch {
    return false;
  }
}

export async function processNextJob(deps: WorkerDeps): Promise<JobOutcome> {
  const job = await deps.store.claim();
  if (!job) return "idle";
  deps.log.info(`job ${job.jobId}: tentative ${job.attempt}`, {
    jobId: job.jobId,
  });

  deps.activeJob.current = job;
  try {
    return await handleJob(deps, job);
  } finally {
    deps.activeJob.current = null;
  }
}

async function handleJob(
  deps: WorkerDeps,
  job: ClaimedJob
): Promise<JobOutcome> {
  const image = await fetchImage(deps, job);
  if (!Buffer.isBuffer(image)) {
    await reportResult(deps, job, "FAILED", image.failure);
    return "failed";
  }

  // Downloading may have taken long enough for the job to go STUCK and be
  // retried. When in doubt, do not print: a stuck job is recoverable by the
  // operator, a photo printed twice is not.
  if (!(await stillOwned(deps, job))) {
    deps.log.error(`job ${job.jobId}: abandonné avant impression`, {
      jobId: job.jobId,
    });
    return "abandoned";
  }

  let result;
  try {
    result = await deps.printer.print(image, deps.printOptions);
  } catch {
    result = { ok: false as const, reason: "Erreur de l'imprimante" };
  }

  if (result.ok) {
    await reportResult(deps, job, "DONE");
    return "done";
  }
  await reportResult(deps, job, "FAILED", result.reason);
  return "failed";
}

/**
 * Runs beside the job loop, so that a long print keeps sending signs of life.
 * Only the job in memory is kept alive: after a crash and a restart, the old
 * job is unknown to this process and goes STUCK, as it should.
 */
export async function runHeartbeat(
  deps: WorkerDeps,
  intervalMs: number
): Promise<void> {
  while (!deps.shouldStop()) {
    try {
      await deps.store.heartbeat(deps.activeJob.current);
    } catch {
      deps.log.error("signal de vie non transmis");
    }
    await deps.sleep(intervalMs);
  }
}

export async function runAgent(
  deps: WorkerDeps,
  pollIntervalMs: number
): Promise<void> {
  while (!deps.shouldStop()) {
    try {
      if ((await processNextJob(deps)) === "idle") {
        await deps.sleep(pollIntervalMs);
      }
    } catch {
      // Usually a lost connection. The job, if any, stays safe on the server.
      deps.log.error("impossible de joindre le serveur, nouvel essai");
      await deps.sleep(pollIntervalMs);
    }
  }
}
