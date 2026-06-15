import { BlobStorageProvider } from "@/lib/storage/blob";
import { logStorageInfo } from "@/lib/storage/logging";
import { NeonStorageProvider } from "@/lib/storage/neon";
import { WorkspaceStore } from "@/lib/storage/storage";

export function createWorkspaceStore() {
  return new WorkspaceStore(createStorageProvider());
}

export function createStorageProvider() {
  if (process.env.STORAGE_BACKEND === "neon") {
    logStorageInfo({ event: "provider_selected", provider: "neon" });
    return new NeonStorageProvider();
  }
  logStorageInfo({ event: "provider_selected", provider: "blob" });
  return new BlobStorageProvider();
}
