/** One line per error, readable in a terminal during the salon. */
export function formatErrors(rows, minutes) {
  if (rows.length === 0) {
    return `Aucune erreur sur les ${minutes} dernières minutes.`;
  }
  return rows
    .map((row) => {
      const time = new Date(row.created_at).toLocaleTimeString("fr-FR", {
        timeZone: "Europe/Paris",
      });
      const where =
        row.source === "agent"
          ? `agent${row.job_id ? ` job ${row.job_id}` : ""}`
          : `web ${row.screen ?? ""}`.trim();
      return `${time}  ${where}  ${row.message}`;
    })
    .join("\n");
}
