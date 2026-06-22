import { Dialect, LocalLinter, WorkerLinter, type Linter } from "harper.js";
import { binary } from "harper.js/binary";

let linterPromise: Promise<Linter> | null = null;
const WORKER_SETUP_TIMEOUT_MS = 4000;

export function getHarperLinter() {
  if (!linterPromise) {
    linterPromise = createHarperLinter().catch((cause) => {
      linterPromise = null;
      throw cause;
    });
  }
  return linterPromise;
}

export function warmHarperLinter() {
  return getHarperLinter().then(() => undefined);
}

async function createHarperLinter(): Promise<Linter> {
  try {
    return await createWorkerLinter();
  } catch {
    return await createLocalLinter();
  }
}

async function createWorkerLinter(): Promise<Linter> {
  const linter = new WorkerLinter({
    binary,
    dialect: Dialect.American
  });

  await promiseWithTimeout(linter.setup(), WORKER_SETUP_TIMEOUT_MS);
  return linter;
}

async function createLocalLinter(): Promise<Linter> {
  const linter = new LocalLinter({
    binary,
    dialect: Dialect.American
  });
  await linter.setup();
  return linter;
}

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Harper worker setup timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        window.clearTimeout(timer);
        reject(cause);
      }
    );
  });
}
