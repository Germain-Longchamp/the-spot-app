import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import path from "path";

/**
 * Scenario: Secrets
 *   When je parcours le dépôt
 *   Then aucun secret n'y figure
 */
test("aucun secret ne figure dans les fichiers trackés par git", () => {
  const repoRoot = path.resolve(__dirname, "../../..");

  // Patterns that indicate a real secret, not a placeholder
  const dangerousPatterns = [
    // Real Supabase service role keys start with eyJ (JWT) and are long
    "service_role.*eyJ",
    // AWS access keys
    "AKIA[0-9A-Z]{16}",
    // Generic high-entropy-looking assignments in env files
    "SUPABASE_SERVICE_ROLE_KEY=ey",
  ];

  // .env.example and .md files are excluded (they use placeholder values)
  const exclude = [
    ":(exclude)*.example",
    ":(exclude)*.md",
    ":(exclude)CLAUDE.md",
    ":(exclude)node_modules",
    ":(exclude).next",
  ];

  let secretsFound = false;
  const findings: string[] = [];

  for (const pattern of dangerousPatterns) {
    try {
      const result = execSync(
        `git grep -rP "${pattern}" -- ${exclude.join(" ")}`,
        { cwd: repoRoot, stdio: "pipe", encoding: "utf-8" }
      );
      if (result.trim()) {
        secretsFound = true;
        findings.push(`Pattern '${pattern}' found:\n${result.trim()}`);
      }
    } catch {
      // git grep exits 1 when no match — that's the expected happy path
    }
  }

  // Also verify .env files are not tracked
  try {
    const tracked = execSync("git ls-files", {
      cwd: repoRoot,
      encoding: "utf-8",
    });
    const envFiles = tracked
      .split("\n")
      .filter((f) => /\.env($|\.)/.test(f) && !f.endsWith(".example"));

    if (envFiles.length > 0) {
      secretsFound = true;
      findings.push(`Fichiers .env trackés dans git : ${envFiles.join(", ")}`);
    }
  } catch {
    // git not available
  }

  expect(secretsFound, findings.join("\n")).toBe(false);
});
