import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";

// Test page for the print button, until the real photo screen exists
// (SCRUM-19, SCRUM-20). Never served in production.
export default function PrintButtonDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-sm p-4">
      <PrintButton photoId="00000000-0000-4000-8000-000000000001" />
    </main>
  );
}
