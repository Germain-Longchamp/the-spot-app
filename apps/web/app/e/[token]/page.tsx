import type { Metadata } from "next";
import { GuestApp } from "@/components/guest/guest-app";

export const metadata: Metadata = {
  title: "The Spot",
  robots: { index: false, follow: false },
};

export default function EventEntryPage({
  params,
}: {
  params: { token: string };
}) {
  return <GuestApp token={params.token} />;
}
