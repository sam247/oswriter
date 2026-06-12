import { BlobStorageAdapter } from "@/lib/storage/blob";
import { WorkspaceStore } from "@/lib/storage/storage";

export function createWorkspaceStore() {
  return new WorkspaceStore(new BlobStorageAdapter());
}
