import { Dialect, WorkerLinter, type Linter } from "harper.js";
import { binary } from "harper.js/binary";

let linterPromise: Promise<Linter> | null = null;

export function getHarperLinter() {
  if (!linterPromise) {
    linterPromise = (async () => {
      const linter = new WorkerLinter({
        binary,
        dialect: Dialect.American
      });
      await linter.setup();
      return linter;
    })();
  }
  return linterPromise;
}

export function warmHarperLinter() {
  return getHarperLinter().then(() => undefined);
}
