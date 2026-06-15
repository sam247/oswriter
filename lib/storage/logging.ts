type StorageLogLevel = "info" | "error";

interface StorageLogEvent {
  level: StorageLogLevel;
  event: string;
  provider: string;
  operation?: string;
  path?: string;
  error?: string;
  data?: Record<string, unknown>;
}

export function logStorageInfo(event: Omit<StorageLogEvent, "level">) {
  emit({ ...event, level: "info" });
}

export function logStorageError(event: Omit<StorageLogEvent, "level">) {
  emit({ ...event, level: "error" });
}

function emit(event: StorageLogEvent) {
  const payload = JSON.stringify({
    at: new Date().toISOString(),
    component: "storage",
    ...event
  });
  if (event.level === "error") console.error("storage", payload);
  else console.info("storage", payload);
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

