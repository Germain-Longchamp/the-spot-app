import { hostname } from "os";

export interface AgentConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  eventId: string;
  agentId: string;
  bucket: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  simulatedDelayMs: number;
  simulatedOutcome: "success" | "failure";
}

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env): AgentConfig {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "EVENT_ID"];
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Variables d'environnement manquantes : ${missing.join(", ")}`
    );
  }

  return {
    supabaseUrl: env.SUPABASE_URL as string,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY as string,
    eventId: env.EVENT_ID as string,
    agentId: env.AGENT_ID || hostname(),
    bucket: env.PHOTOS_BUCKET || "photos",
    pollIntervalMs: Number(env.POLL_INTERVAL_MS) || 2000,
    heartbeatIntervalMs: Number(env.HEARTBEAT_INTERVAL_MS) || 15_000,
    simulatedDelayMs: Number(env.SIMULATED_PRINTER_DELAY_MS) || 3000,
    simulatedOutcome:
      env.SIMULATED_PRINTER_OUTCOME === "failure" ? "failure" : "success",
  };
}
