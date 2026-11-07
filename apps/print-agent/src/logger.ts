import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "fs";
import { join } from "path";

/** What a log line may carry: ids and technical reasons, never a photo. */
export interface LogFields {
  jobId?: string;
  reason?: string;
}

export interface Logger {
  info(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export interface ErrorEntry {
  time: string;
  agentId: string;
  eventId: string;
  jobId: string | null;
  message: string;
}

/** Where errors go to be read by the team: the shared app_errors table. */
export type ErrorSink = (entries: ErrorEntry[]) => Promise<void>;

export interface LoggerOptions {
  agentId: string;
  eventId: string;
  /** Folder for agent.log; created if missing. */
  dir: string;
  /** Rotation: the file is renamed once it reaches this size. */
  maxBytes?: number;
  /** Rotation: how many old files are kept (agent.log.1, .2, …). */
  maxFiles?: number;
  /** Errors waiting for the network beyond this are dropped, oldest first. */
  maxQueued?: number;
  /** At most this many errors sent per minute, so a loop cannot flood. */
  maxSentPerMinute?: number;
  now?: () => Date;
  console?: Pick<Console, "log" | "error">;
}

export interface AgentLogger extends Logger {
  /** Sends the errors waiting for the network. Never throws. */
  flush(sink: ErrorSink): Promise<void>;
  /** Errors not sent yet, for tests and for the shutdown message. */
  pending(): number;
}

/**
 * One JSON object per line, in the console (PM2 keeps it) and in a local file
 * that survives without network and rotates before the disk fills up.
 */
export function createLogger(options: LoggerOptions): AgentLogger {
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const maxFiles = options.maxFiles ?? 5;
  const maxQueued = options.maxQueued ?? 500;
  const maxSentPerMinute = options.maxSentPerMinute ?? 30;
  const now = options.now ?? (() => new Date());
  const out = options.console ?? console;
  const file = join(options.dir, "agent.log");

  const queue: ErrorEntry[] = [];
  let dropped = 0;
  let windowStart = 0;
  let sentInWindow = 0;

  mkdirSync(options.dir, { recursive: true });

  function rotate() {
    if (!existsSync(file) || statSync(file).size < maxBytes) return;
    for (let i = maxFiles - 1; i >= 1; i--) {
      const from = `${file}.${i}`;
      if (existsSync(from)) renameSync(from, `${file}.${i + 1}`);
    }
    renameSync(file, `${file}.1`);
    // Anything beyond maxFiles is overwritten on the next rotation.
  }

  function write(level: "info" | "error", message: string, fields: LogFields = {}) {
    const time = now().toISOString();
    const line = JSON.stringify({
      time,
      level,
      agent: options.agentId,
      event: options.eventId,
      job: fields.jobId ?? null,
      message,
      ...(fields.reason ? { reason: fields.reason } : {}),
    });
    (level === "error" ? out.error : out.log)(line);
    try {
      rotate();
      appendFileSync(file, line + "\n");
    } catch {
      // A full or read-only disk must not stop the prints.
    }

    if (level === "error") {
      queue.push({
        time,
        agentId: options.agentId,
        eventId: options.eventId,
        jobId: fields.jobId ?? null,
        message: fields.reason ? `${message} : ${fields.reason}` : message,
      });
      while (queue.length > maxQueued) {
        queue.shift();
        dropped += 1;
      }
    }
  }

  return {
    info: (message, fields) => write("info", message, fields),
    error: (message, fields) => write("error", message, fields),
    pending: () => queue.length,

    async flush(sink) {
      const current = now().getTime();
      if (current - windowStart >= 60_000) {
        windowStart = current;
        sentInWindow = 0;
      }
      const room = maxSentPerMinute - sentInWindow;
      if (room <= 0 || (queue.length === 0 && dropped === 0)) return;

      const batch = queue.slice(0, room);
      if (dropped > 0 && batch.length < room) {
        batch.push({
          time: now().toISOString(),
          agentId: options.agentId,
          eventId: options.eventId,
          jobId: null,
          message: `${dropped} erreurs perdues : trop d'erreurs pendant la coupure`,
        });
      }
      try {
        await sink(batch);
        const fromQueue = Math.min(batch.length, queue.length);
        queue.splice(0, fromQueue);
        if (batch.length > fromQueue) dropped = 0;
        sentInWindow += batch.length;
      } catch {
        // No network: the errors stay queued and leave with the next flush.
      }
    },
  };
}
