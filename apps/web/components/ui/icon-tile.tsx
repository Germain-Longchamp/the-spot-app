import type { ReactNode } from "react";

/** One size for every icon tile of a screen (SCRUM-68): 44 px, icon 24 px. */
export const ICON_TILE_SIZE = 44;
export const ICON_SIZE = 24;

/**
 * The light square behind an icon. Its tint follows the block it sits on
 * (`tint`): translucent white on a coloured block, page background on a
 * white one. The size never changes, so blocks stay aligned.
 */
export function IconTile({ tint, children }: { tint: string; children: ReactNode }) {
  return (
    <span
      data-testid="icon-tile"
      className={`flex size-11 shrink-0 items-center justify-center rounded-[14px] ${tint}`}
    >
      {children}
    </span>
  );
}
