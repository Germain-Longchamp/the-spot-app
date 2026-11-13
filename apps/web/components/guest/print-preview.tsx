"use client";

import { useEffect, useState } from "react";
import {
  BAND,
  BandLineStyle,
  bandTextWidthMm,
  cleanLine,
  fitLine,
  FrameText,
  pageLayoutPercent,
  PRINT_LAYOUT,
} from "@/lib/print/layout";

const layout = pageLayoutPercent();

/** A length on the paper, as a share of the page's width (it is a container). */
const cqw = (mm: number) => `${(mm / PRINT_LAYOUT.paperMm.width) * 100}cqw`;

interface Line {
  text: string;
  sizeMm: number;
  style: BandLineStyle;
}

const STYLES = [BAND.line1, BAND.line2];

/**
 * The band's lines fitted as the agent fits them (SCRUM-60), measured with
 * the page's own Inter once it has loaded. Until then: the mockup's sizes,
 * and the browser cuts a line that is too long.
 */
function useBandLines(frame: FrameText | null | undefined): Line[] {
  const line1 = frame?.line1 ?? "";
  const line2 = frame?.line2 ?? "";
  const [lines, setLines] = useState<Line[]>(() =>
    [line1, line2].map((raw, i) => ({
      text: cleanLine(raw, STYLES[i]),
      sizeMm: STYLES[i].sizeMm,
      style: STYLES[i],
    }))
  );

  useEffect(() => {
    let active = true;
    const fit = () => {
      if (!active) return;
      const context = document.createElement("canvas").getContext("2d");
      const family = getComputedStyle(document.body).fontFamily;
      setLines(
        [line1, line2].map((raw, i) => {
          const style = STYLES[i];
          const text = cleanLine(raw, style);
          const measureEm = (t: string) => {
            if (!context) return 0;
            context.font = `${style.bold ? 700 : 400} 100px ${family}`;
            return context.measureText(t).width / 100 + style.letterSpacingEm * Array.from(t).length;
          };
          return { ...fitLine(text, style, bandTextWidthMm(), measureEm), style };
        })
      );
    };
    if (document.fonts?.ready) document.fonts.ready.then(fit);
    else fit();
    return () => {
      active = false;
    };
  }, [line1, line2]);

  return lines.filter((line) => line.text.length > 0);
}

/** The texts and the icon below the photo, placed as on the print. */
function Band({ frame }: { frame: FrameText }) {
  const lines = useBandLines(frame);
  const bandTop = layout.photo.top + layout.photo.height;
  return (
    <div
      data-testid="print-band"
      className="absolute flex items-center justify-between text-left"
      style={{
        left: `${layout.photo.left}%`,
        width: `${layout.photo.width}%`,
        top: `${bandTop}%`,
        bottom: 0,
      }}
    >
      <div
        className="flex min-w-0 flex-col"
        style={{ width: cqw(bandTextWidthMm()), gap: cqw(BAND.lineGapMm) }}
      >
        {lines.map((line, i) => (
          <span
            key={i}
            data-testid={`print-line${i + 1}`}
            className="overflow-hidden text-ellipsis whitespace-nowrap"
            style={{
              fontSize: cqw(line.sizeMm),
              lineHeight: BAND.lineHeight,
              fontWeight: line.style.bold ? 700 : 400,
              letterSpacing: `${line.style.letterSpacingEm}em`,
              color: line.style.color,
            }}
          >
            {line.text}
          </span>
        ))}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/icone-couleur.svg"
        alt=""
        data-testid="print-icon"
        className="shrink-0"
        style={{ width: cqw(BAND.iconMm), height: cqw(BAND.iconMm) }}
      />
    </div>
  );
}

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
 * `frame`: the texts of the band below the photo (SCRUM-60).
 */
export function PrintPreview({
  src,
  fit = false,
  maxWidth = "24rem",
  onOpen,
  frame,
}: {
  src: string;
  fit?: boolean;
  maxWidth?: string;
  onOpen?: () => void;
  frame?: FrameText | null;
}) {
  const ratio = layout.pageRatio;
  const width = fit
    ? `min(100cqw, calc(100cqh * ${ratio}))`
    : `min(100%, ${maxWidth}, calc(52dvh * ${ratio}))`;

  const sheet = (
    <div
      data-testid="print-page"
      className="relative mx-auto shrink-0 rounded-sm bg-surface shadow-lift [container-type:inline-size]"
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
      {frame && <Band frame={frame} />}
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
