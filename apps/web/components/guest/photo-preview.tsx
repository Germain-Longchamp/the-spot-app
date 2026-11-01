"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  photo: Blob;
  onRetake: () => void;
}

export function PhotoPreview({ photo, onRetake }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col gap-4 p-4">
      {url && (
        // A local blob: there is nothing for an image optimizer to do.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Votre photo" className="w-full rounded-lg" />
      )}
      <Button variant="secondary" onClick={onRetake}>
        Reprendre
      </Button>
    </main>
  );
}
