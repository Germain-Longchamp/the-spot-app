import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";

interface Props {
  /** Shown top left, always visible: the way back (UX rule 8). */
  back?: { label: string; onClick: () => void };
  title?: string;
  children: ReactNode;
  /** Pinned to the bottom of the screen, within thumb reach. */
  footer?: ReactNode;
  /** Changes on each step, so the entrance animation plays again. */
  stepKey?: string;
  /**
   * Exactly one screen high, the footer in the flow: the content shrinks to
   * the room left instead of sliding under the footer. For screens whose
   * footer carries what the guest needs to decide (SCRUM-52).
   */
  fit?: boolean;
  /** Top right in place of the logo, e.g. the printer status (SCRUM-66). */
  aside?: ReactNode;
}

/**
 * One step of the guest flow: a header with the way back, the content, and
 * the actions pinned at the bottom. One main action per screen.
 */
export function Screen({ back, title, children, footer, stepKey, fit = false, aside }: Props) {
  return (
    <div
      className={`mx-auto flex w-full max-w-md flex-col ${fit ? "h-[100dvh]" : "min-h-[100dvh]"}`}
    >
      <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-3 bg-background/90 px-4 backdrop-blur">
        {back ? (
          <button
            type="button"
            onClick={back.onClick}
            className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 font-semibold transition-transform active:scale-95"
          >
            <ArrowLeftIcon size={22} />
            {back.label}
          </button>
        ) : (
          <span />
        )}
        {aside ?? <Logo variant="icon" width={32} />}
      </header>

      <main
        key={stepKey}
        className={`flex flex-1 animate-screen-in flex-col gap-6 px-4 pt-2 ${
          fit ? "min-h-0 gap-4 overflow-y-auto pb-4" : footer ? "pb-44" : "pb-8"
        }`}
      >
        {title && <h1 className="text-2xl font-semibold">{title}</h1>}
        {children}
      </main>

      {footer && fit && (
        <div className="shrink-0 bg-surface shadow-bar">
          <div className="flex w-full flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        </div>
      )}

      {footer && !fit && (
        <div className="fixed inset-x-0 bottom-0 z-10 bg-surface/95 shadow-bar backdrop-blur">
          <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}
