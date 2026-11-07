#!/usr/bin/env node
// Shows the latest errors from the guests' phones and the print agent, oldest
// first, so the sequence around an incident reads from top to bottom.
//
//   cd apps/web && node --env-file=.env.local scripts/recent-errors.mjs [minutes] [event-id]
//
// Default: the last 60 minutes, every event.
import { formatErrors } from "./errors-lib.mjs";

const [minutesArg, eventId] = process.argv.slice(2);
const minutes = Number(minutesArg) || 60;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !key) {
  console.error(
    "Usage : node --env-file=.env.local scripts/recent-errors.mjs [minutes] [event-id]\n" +
      "Variables requises : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const since = new Date(Date.now() - minutes * 60_000).toISOString();
const params = new URLSearchParams({
  select: "created_at,source,event_id,job_id,screen,browser,message",
  created_at: `gte.${since}`,
  order: "created_at.asc",
  limit: "500",
});
if (eventId) params.set("event_id", `eq.${eventId}`);

const response = await fetch(`${supabaseUrl}/rest/v1/app_errors?${params}`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!response.ok) {
  console.error(`Lecture impossible (${response.status}).`);
  process.exit(1);
}

console.log(formatErrors(await response.json(), minutes));
