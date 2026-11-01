"use client";

import { useState } from "react";
import { Camera } from "@/components/guest/camera";
import { EventHome } from "@/components/guest/event-home";
import { PhotoPreview } from "@/components/guest/photo-preview";
import type { GuestEvent } from "@/lib/guest/enter-event";

type Screen =
  | { name: "home" }
  | { name: "camera" }
  | { name: "preview"; photo: Blob };

interface Props {
  event: GuestEvent;
  token: string;
}

/** The steps stay on one page: the photo must not leave the phone before the guest validates it. */
export function GuestFlow({ event, token }: Props) {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const home = () => setScreen({ name: "home" });

  if (screen.name === "camera") {
    return (
      <Camera
        onCapture={(photo) => setScreen({ name: "preview", photo })}
        onCancel={home}
      />
    );
  }

  if (screen.name === "preview") {
    return <PhotoPreview photo={screen.photo} onRetake={home} />;
  }

  return (
    <EventHome
      event={event}
      token={token}
      onTakePhoto={() => setScreen({ name: "camera" })}
    />
  );
}
