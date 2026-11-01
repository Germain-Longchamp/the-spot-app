import { randomBytes, randomInt } from "node:crypto";
import QRCode from "qrcode";

// No 0/O or 1/I/L: the code is read from a poster and typed on a phone.
const SHORT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SHORT_CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

export function generateAccessToken() {
  return randomBytes(32).toString("base64url");
}

export function generateShortCode() {
  return Array.from(
    { length: SHORT_CODE_LENGTH },
    () => SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)]
  ).join("");
}

export function accessUrl(siteUrl, token) {
  return `${siteUrl.replace(/\/$/, "")}/e/${token}`;
}

/** Inserts the event, drawing new codes if they collide with an existing one. */
export async function insertEvent({ supabaseUrl, serviceKey, name, fetchFn }) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const event = {
      name,
      access_token: generateAccessToken(),
      short_code: generateShortCode(),
    };

    const response = await fetchFn(`${supabaseUrl}/rest/v1/events`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(event),
    });

    if (response.ok) {
      const [created] = await response.json();
      return created;
    }
    if (response.status !== 409) {
      throw new Error(`Création refusée (${response.status})`);
    }
  }
  throw new Error("Impossible de générer des codes uniques");
}

export function qrSvg(url) {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "H" });
}

export function qrPng(url, path) {
  return QRCode.toFile(path, url, {
    errorCorrectionLevel: "H",
    width: 1024,
    margin: 4,
  });
}
