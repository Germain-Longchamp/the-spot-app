export interface PrintOptions {
  copies: number;
}

export type PrintResult = { ok: true } | { ok: false; reason: string };

/**
 * The only contact point with a printer. Moving from the simulator to the real
 * hardware (SCRUM-26) means adding an implementation of this interface.
 */
export interface Printer {
  print(image: Buffer, options: PrintOptions): Promise<PrintResult>;
}

export interface SimulatedPrinterOptions {
  delayMs: number;
  outcome: "success" | "failure";
}

export class SimulatedPrinter implements Printer {
  constructor(private readonly options: SimulatedPrinterOptions) {}

  async print(): Promise<PrintResult> {
    await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
    return this.options.outcome === "success"
      ? { ok: true }
      : { ok: false, reason: "Échec simulé de l'imprimante" };
  }
}
