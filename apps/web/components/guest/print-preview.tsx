import { pageLayoutPercent } from "@/lib/print/layout";

const layout = pageLayoutPercent();

/**
 * The print as it will come out (SCRUM-65): white paper in portrait, the
 * Polaroid borders, the photo cut to 4:5 in the middle (object-cover keeps
 * the centre, the same zone as `centerCrop`) and the empty band below.
 * Every number comes from lib/print/layout.ts, shared with the print agent.
 *
 * `fit`: takes the room it is given (a container with a size) and shrinks to
 * it. Otherwise as wide as `maxWidth`, never taller than half the screen.
 *
 * `onOpen`: the page becomes a button that shows it full screen (SCRUM-66).
 */
export function PrintPreview({
  src,
  fit = false,
  maxWidth = "24rem",
  onOpen,
}: {
  src: string;
  fit?: boolean;
  maxWidth?: string;
  onOpen?: () => void;
}) {
  const ratio = layout.pageRatio;
  const width = fit
    ? `min(100cqw, calc(100cqh * ${ratio}))`
    : `min(100%, ${maxWidth}, calc(52dvh * ${ratio}))`;

  const sheet = (
    <div
      data-testid="print-page"
      className="relative mx-auto shrink-0 rounded-sm bg-surface shadow-lift"
      style={{ width, aspectRatio: `${ratio}` }}
    >
      <div
        className="absolute overflow-hidden bg-divider"
        style={{
          left: `${layout.photo.left}%`,
          top: `${layout.photo.top}%`,
          width: `${layout.photo.width}%`,
          height: `${layout.photo.height}%`,
        }}
      >
        {/* A local blob: nothing for an image optimizer to do. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Votre photo"
          data-testid="print-photo"
          className="size-full object-cover"
        />
      </div>
    </div>
  );

  const page = onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Voir le tirage en grand"
      className="flex max-h-full max-w-full justify-center rounded-sm transition-transform active:scale-[0.98]"
    >
      {sheet}
    </button>
  ) : (
    sheet
  );

  if (!fit) return page;
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]">
      {page}
    </div>
  );
}
