import type { Metadata } from "next";
import { GalleryApp } from "@/components/guest/gallery-app";

export const metadata: Metadata = {
  title: "Galerie · The Spot Memories",
  robots: { index: false, follow: false },
};

export default function GalleryPage({
  params,
}: {
  params: { token: string };
}) {
  return <GalleryApp token={params.token} />;
}
