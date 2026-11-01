#!/usr/bin/env node
// Creates an event and its QR code. For the salon, from apps/web:
//
//   node --env-file=.env.local scripts/create-event.mjs "Salon démo" https://the-spot-app.vercel.app
//
// Writes qr-<short code>.png and .svg in the current folder. Print the image:
// its error correction survives a damaged poster, and the short code printed
// below is the fallback.
import { writeFile } from "node:fs/promises";
import { accessUrl, insertEvent, qrPng, qrSvg } from "./event-lib.mjs";

const [name, siteUrl] = process.argv.slice(2);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!name || !siteUrl || !supabaseUrl || !serviceKey) {
  console.error(
    'Usage : node --env-file=.env.local scripts/create-event.mjs "Nom" <url-du-site>\n' +
      "Variables requises : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const event = await insertEvent({
  supabaseUrl,
  serviceKey,
  name,
  fetchFn: fetch,
});

const url = accessUrl(siteUrl, event.access_token);
const base = `qr-${event.short_code}`;
await qrPng(url, `${base}.png`);
await writeFile(`${base}.svg`, await qrSvg(url));

console.log(`Événement : ${event.name} (${event.id})`);
console.log(`Lien d'accès : ${url}`);
console.log(`Code de secours : ${event.short_code}`);
console.log(`QR code : ${base}.png et ${base}.svg`);
