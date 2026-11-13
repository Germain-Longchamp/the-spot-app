import type { SupabaseClient } from "@supabase/supabase-js";
import { frameTextOf } from "@/lib/guest/album";
import type { PrintJobStatus } from "@/lib/print/job-status";

export interface PanelJob {
  id: string;
  status: PrintJobStatus;
  authorized: boolean;
  createdAt: string;
  lastError: string | null;
  photoUrl: string | null;
  /** The texts printed under the photo (SCRUM-61): the team reads them first. */
  frameText?: string | null;
}

export interface GalleryItem {
  id: string;
  thumbUrl: string | null;
}

export interface PanelSnapshot {
  eventName: string;
  /** Path of the guests' access link, "/e/<token>": the QR code points there. */
  accessPath: string;
  /** Fallback code printed under the QR code. */
  shortCode: string;
  printLimit: number | null;
  paused: boolean;
  eventOpen: boolean;
  galleryEnabled: boolean;
  galleryVisible: boolean;
  printerOnline: boolean;
  jobs: PanelJob[];
  /** Published photos, newest first, for the team to remove if needed. */
  gallery: GalleryItem[];
}

const MAX_JOBS = 500;
const MAX_THUMBNAILS = 50;
const MAX_GALLERY = 60;
const THUMBNAIL_SECONDS = 300;
const PHOTOS_BUCKET = "photos";

/** What needs the team first: in progress, then problems, then the queue. */
const priority: Record<PrintJobStatus, number> = {
  PRINTING: 0,
  STUCK: 1,
  FAILED: 1,
  PENDING: 2,
  DONE: 3,
  CANCELLED: 3,
};

export function sortJobs(jobs: PanelJob[]): PanelJob[] {
  return [...jobs].sort((a, b) => {
    const rank = priority[a.status] - priority[b.status];
    if (rank !== 0) return rank;
    // First come, first served in the queue; latest first in the history.
    const order = a.createdAt.localeCompare(b.createdAt);
    return priority[a.status] === 3 ? -order : order;
  });
}

export function operatorStatusLabel(job: PanelJob): string {
  switch (job.status) {
    case "PENDING":
      return job.authorized ? "Lancement en cours" : "En attente";
    case "PRINTING":
      return "En impression";
    case "DONE":
      return "Imprimée";
    case "STUCK":
      return "Bloquée, à vérifier sur l'imprimante";
    case "FAILED":
      return "Échec";
    case "CANCELLED":
      return "Annulée";
  }
}

export function panelCounts(jobs: PanelJob[]) {
  const count = (...statuses: PrintJobStatus[]) =>
    jobs.filter((job) => statuses.includes(job.status)).length;
  return {
    waiting: count("PENDING"),
    printing: count("PRINTING"),
    problems: count("STUCK", "FAILED"),
    done: count("DONE"),
    /** Counted against the event's limit: everything but cancelled requests. */
    used: jobs.length - count("CANCELLED"),
  };
}

interface JobRow {
  id: string;
  status: PrintJobStatus;
  authorized_at: string | null;
  created_at: string;
  last_error: string | null;
  frame_line1: string | null;
  frame_line2: string | null;
  photos: { storage_path: string } | null;
}

/** Reads everything the panel shows. Throws if the data cannot be read. */
export async function loadSnapshot(
  client: SupabaseClient,
  eventId: string,
): Promise<PanelSnapshot> {
  const [event, jobs, printer, gallery] = await Promise.all([
    client
      .from("events")
      .select(
        "name, access_token, short_code, print_limit, printing_paused, status, gallery_enabled, gallery_visible",
      )
      .eq("id", eventId)
      .single(),
    client
      .from("print_jobs")
      .select(
        "id, status, authorized_at, created_at, last_error, frame_line1, frame_line2, photos(storage_path)",
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(MAX_JOBS),
    client.rpc("get_printer_status", { p_event_id: eventId }),
    client
      .from("photos")
      .select("id, storage_path, thumb_path")
      .eq("event_id", eventId)
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_GALLERY),
  ]);

  if (event.error) throw new Error(event.error.message);
  if (jobs.error) throw new Error(jobs.error.message);
  if (printer.error) throw new Error(printer.error.message);
  if (gallery.error) throw new Error(gallery.error.message);

  const rows = (jobs.data ?? []) as unknown as JobRow[];
  const sorted = sortJobs(
    rows.map((row) => ({
      id: row.id,
      status: row.status,
      authorized: row.authorized_at !== null,
      createdAt: row.created_at,
      lastError: row.last_error,
      photoUrl: null,
      frameText: frameTextOf(row.frame_line1, row.frame_line2),
    })),
  );

  return {
    eventName: event.data.name,
    accessPath: `/e/${event.data.access_token}`,
    shortCode: event.data.short_code,
    printLimit: event.data.print_limit,
    paused: event.data.printing_paused,
    eventOpen: event.data.status === "open",
    galleryEnabled: event.data.gallery_enabled,
    galleryVisible: event.data.gallery_visible,
    printerOnline: printer.data === true,
    jobs: await withThumbnails(client, sorted, rows),
    gallery: await galleryItems(client, gallery.data ?? []),
  };
}

/** A missing thumbnail must never hide a photo the team may want to remove. */
async function galleryItems(
  client: SupabaseClient,
  rows: { id: string; storage_path: string; thumb_path: string | null }[],
): Promise<GalleryItem[]> {
  if (rows.length === 0) return [];
  const pathOf = (row: (typeof rows)[number]) =>
    row.thumb_path ?? row.storage_path;
  const { data } = await client.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls(rows.map(pathOf), THUMBNAIL_SECONDS);
  const urlOf = new Map(
    (data ?? []).map((item) => [item.path, item.signedUrl]),
  );
  return rows.map((row) => ({
    id: row.id,
    thumbUrl: urlOf.get(pathOf(row)) || null,
  }));
}

/** A missing thumbnail must never hide a job, so failures are ignored. */
async function withThumbnails(
  client: SupabaseClient,
  jobs: PanelJob[],
  rows: JobRow[],
): Promise<PanelJob[]> {
  const pathOf = new Map(rows.map((r) => [r.id, r.photos?.storage_path]));
  const paths = jobs
    .slice(0, MAX_THUMBNAILS)
    .map((job) => pathOf.get(job.id))
    .filter((path): path is string => Boolean(path));
  if (paths.length === 0) return jobs;

  const { data, error } = await client.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls(paths, THUMBNAIL_SECONDS);
  if (error || !data) return jobs;

  const urlOf = new Map(data.map((item) => [item.path, item.signedUrl]));
  return jobs.map((job) => ({
    ...job,
    photoUrl: urlOf.get(pathOf.get(job.id) ?? "") || null,
  }));
}
