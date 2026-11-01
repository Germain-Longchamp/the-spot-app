import {
  ClaimedJob,
  ImageUnavailableError,
  JobReport,
  JobStore,
} from "./worker";

interface ApiError {
  message: string;
  status?: number;
  statusCode?: string;
}

interface ApiResult<T> {
  data: T | null;
  error: ApiError | null;
}

/** The parts of the Supabase client the agent uses. */
export interface SupabaseLike {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<ApiResult<Record<string, unknown>>>;
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        single(): PromiseLike<ApiResult<{ status: string; attempt: number }>>;
      };
    };
  };
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number
      ): PromiseLike<ApiResult<{ signedUrl: string }>>;
    };
  };
}

export interface StoreConfig {
  eventId: string;
  agentId: string;
  bucket: string;
  downloadTimeoutMs: number;
}

const SIGNED_URL_SECONDS = 60;

export class SupabaseJobStore implements JobStore {
  constructor(
    private readonly client: SupabaseLike,
    private readonly config: StoreConfig,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async claim(): Promise<ClaimedJob | null> {
    const { data, error } = await this.client.rpc("claim_print_job", {
      p_event_id: this.config.eventId,
      p_agent_id: this.config.agentId,
    });
    if (error) throw new Error(error.message);
    if (data?.result !== "claimed") return null;
    return {
      jobId: data.job_id as string,
      attempt: data.attempt as number,
      storagePath: data.storage_path as string,
    };
  }

  async isCurrent(job: ClaimedJob): Promise<boolean> {
    const { data, error } = await this.client
      .from("print_jobs")
      .select("status, attempt")
      .eq("id", job.jobId)
      .single();
    if (error) throw new Error(error.message);
    return data?.status === "PRINTING" && data.attempt === job.attempt;
  }

  /** Asks for a new URL each time, so an expired one is never reused. */
  async downloadImage(storagePath: string): Promise<Buffer> {
    const { data, error } = await this.client.storage
      .from(this.config.bucket)
      .createSignedUrl(storagePath, SIGNED_URL_SECONDS);

    if (error) {
      const status = error.status ?? Number(error.statusCode);
      if (status >= 400 && status < 500) {
        throw new ImageUnavailableError("la photo n'est plus disponible");
      }
      throw new Error(error.message);
    }

    const response = await this.fetchFn(data?.signedUrl ?? "", {
      signal: AbortSignal.timeout(this.config.downloadTimeoutMs),
    });
    if (response.status === 404) {
      throw new ImageUnavailableError("la photo n'est plus disponible");
    }
    if (!response.ok) {
      throw new Error(`téléchargement refusé (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async report(
    job: ClaimedJob,
    status: JobReport,
    detail?: string
  ): Promise<string> {
    const { data, error } = await this.client.rpc("transition_print_job", {
      p_job_id: job.jobId,
      p_to: status,
      p_actor: "agent",
      p_attempt: job.attempt,
      p_agent_id: this.config.agentId,
      p_detail: detail ?? null,
    });
    if (error) throw new Error(error.message);
    return String(data?.result);
  }

  async heartbeat(job: ClaimedJob | null): Promise<void> {
    const { error } = await this.client.rpc("record_agent_heartbeat", {
      p_event_id: this.config.eventId,
      p_agent_id: this.config.agentId,
      p_job_id: job?.jobId ?? null,
      p_attempt: job?.attempt ?? null,
    });
    if (error) throw new Error(error.message);
  }
}
