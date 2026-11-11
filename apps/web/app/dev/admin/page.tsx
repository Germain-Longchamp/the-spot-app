import { notFound } from "next/navigation";
import { DevAdmin } from "./dev-admin";

// Test page: the real admin space needs a Supabase session, out of reach of
// browser tests. Same component, with fixed data. Never served in production.
export default function AdminDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevAdmin />;
}
