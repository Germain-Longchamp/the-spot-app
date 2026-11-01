import { test, expect } from "@playwright/test";
import { guestStatusLabel, PrintJobStatus } from "../lib/print/job-status";

const statuses: PrintJobStatus[] = [
  "PENDING",
  "PRINTING",
  "DONE",
  "STUCK",
  "FAILED",
];

test("chaque statut a un texte humain, sans statut brut", () => {
  for (const status of statuses) {
    const label = guestStatusLabel(status);
    expect(label.length).toBeGreaterThan(0);
    for (const raw of statuses) {
      expect(label).not.toContain(raw);
    }
  }
});

test("une panne renvoie l'invité vers l'équipe", () => {
  expect(guestStatusLabel("STUCK")).toContain("équipe");
  expect(guestStatusLabel("FAILED")).toContain("équipe");
});
