import { notFound } from "next/navigation";
import { DevOperatorPanel } from "./dev-operator-panel";

// Test page: the real panel reads the database from the server, out of reach of
// browser tests. Same component, with fixed data. Never served in production.
export default function OperatorPanelDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <DevOperatorPanel />;
}
