import type EmbeddedPostgres from "embedded-postgres";
import { randomUUID } from "crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { createServer } from "net";
import { tmpdir } from "os";
import path from "path";
import { Pool, PoolClient } from "pg";

const migrationsDir = path.resolve(__dirname, "../../../../supabase/migrations");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export interface Fixture {
  eventId: string;
  guestId: string;
  userId: string;
  photoId: string;
}

export type Role = "anon" | "authenticated";

/** A real Postgres with the repo's migrations applied, on a throwaway disk. */
export class TestDb {
  private constructor(
    private server: EmbeddedPostgres,
    private dir: string,
    /** Superuser pool: seeds and inspects data, bypassing RLS. */
    readonly admin: Pool
  ) {}

  static async start(): Promise<TestDb> {
    const dir = mkdtempSync(path.join(tmpdir(), "the-spot-test-"));
    const port = await freePort();
    // Dynamic: the package is ESM-only and Playwright loads specs as CommonJS.
    const { default: Postgres } = await import("embedded-postgres");
    const server = new Postgres({
      databaseDir: dir,
      user: "postgres",
      password: "test-only",
      port,
      persistent: false,
      onLog: () => undefined,
      onError: () => undefined,
    });
    await server.initialise();
    await server.start();

    const admin = new Pool({
      host: "127.0.0.1",
      port,
      user: "postgres",
      password: "test-only",
      database: "postgres",
      max: 20,
    });
    // Stopping Postgres can reach a connection the pool has not finished
    // closing. Without a listener, that error would crash the test worker.
    admin.on("connect", (client) => client.on("error", () => undefined));

    await admin.query(
      readFileSync(path.join(__dirname, "supabase-stub.sql"), "utf-8")
    );
    for (const file of readdirSync(migrationsDir).sort()) {
      if (file.endsWith(".sql")) {
        await admin.query(readFileSync(path.join(migrationsDir, file), "utf-8"));
      }
    }
    return new TestDb(server, dir, admin);
  }

  async stop(): Promise<void> {
    await this.admin.end();
    await this.server.stop();
    rmSync(this.dir, { recursive: true, force: true });
  }

  /** Runs `work` the way PostgREST would: one transaction, one role, one user. */
  async as<T>(
    role: Role,
    userId: string | null,
    work: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.admin.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('role', $1, true)", [role]);
      await client.query(
        "select set_config('request.jwt.claim.sub', $1, true)",
        [userId ?? ""]
      );
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async createPrintJob(userId: string, photoId: string, key: string) {
    return this.as("authenticated", userId, async (client) => {
      const { rows } = await client.query(
        "select public.create_print_job($1, $2) as result",
        [photoId, key]
      );
      return rows[0].result as { result: string; job_id?: string };
    });
  }

  /** An open event with one guest who owns one photo. */
  async seed(
    event: { quota?: number; paused?: boolean; status?: string } = {}
  ): Promise<Fixture> {
    const eventId = randomUUID();
    await this.admin.query(
      `insert into public.events
         (id, name, status, print_quota_per_guest, printing_paused)
       values ($1, 'Salon test', $2, $3, $4)`,
      [eventId, event.status ?? "open", event.quota ?? 2, event.paused ?? false]
    );
    const guest = await this.seedGuest(eventId);
    return { eventId, ...guest };
  }

  async seedGuest(eventId: string) {
    const userId = randomUUID();
    const guestId = randomUUID();
    await this.admin.query("insert into auth.users (id) values ($1)", [userId]);
    await this.admin.query(
      `insert into public.guests (id, event_id, auth_user_id)
       values ($1, $2, $3)`,
      [guestId, eventId, userId]
    );
    const photoId = await this.seedPhoto(eventId, guestId);
    return { guestId, userId, photoId };
  }

  async seedPhoto(eventId: string, guestId: string): Promise<string> {
    const photoId = randomUUID();
    await this.admin.query(
      `insert into public.photos (id, event_id, guest_id, storage_path)
       values ($1, $2, $3, 'test/photo.jpg')`,
      [photoId, eventId, guestId]
    );
    return photoId;
  }

  async jobCount(guestId: string): Promise<number> {
    const { rows } = await this.admin.query(
      "select count(*)::int as n from public.print_jobs where guest_id = $1",
      [guestId]
    );
    return rows[0].n;
  }
}
