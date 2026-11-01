#!/usr/bin/env node
// Creates or replaces the operator link of an event. The old link stops
// working at once, so this is also what to run if a link leaks.
//
//   cd apps/web && node --env-file=.env.local scripts/operator-link.mjs <event-id> <site-url>
//
// Only a hash goes to the database: the link is shown once, here.
import { createHash, randomBytes } from "node:crypto";

const [eventId, siteUrl] = process.argv.slice(2);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!eventId || !siteUrl || !supabaseUrl || !key) {
  console.error(
    "Usage : node --env-file=.env.local scripts/operator-link.mjs <event-id> <site-url>\n" +
      "Variables requises : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");

const response = await fetch(`${supabaseUrl}/rest/v1/event_operator_tokens`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  },
  body: JSON.stringify({ event_id: eventId, token_hash: tokenHash }),
});

if (!response.ok) {
  console.error(`Échec : ${response.status} ${await response.text()}`);
  process.exit(1);
}

console.log(`${siteUrl.replace(/\/$/, "")}/operateur/${token}`);
