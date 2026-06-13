import type { StorageAdapter } from "@/lib/storage/storage";

export class MemoryStorageAdapter implements StorageAdapter {
  private docs = new Map<string, string>();

  async getJson<T>(path: string): Promise<T | null> {
    const raw = this.docs.get(path);
    return raw ? JSON.parse(raw) as T : null;
  }

  async putJson<T>(path: string, value: T): Promise<void> {
    this.docs.set(path, JSON.stringify(value));
  }

  async putJsonIfAbsent<T>(path: string, value: T): Promise<boolean> {
    if (this.docs.has(path)) return false;
    this.docs.set(path, JSON.stringify(value));
    return true;
  }

  async putText(path: string, value: string): Promise<void> {
    this.docs.set(path, value);
  }

  async listJson<T>(prefix: string): Promise<T[]> {
    return [...this.docs.entries()]
      .filter(([path]) => path.startsWith(prefix) && path.endsWith(".json"))
      .map(([, raw]) => JSON.parse(raw) as T);
  }

  async listPaths(prefix: string): Promise<string[]> {
    return [...this.docs.keys()].filter((path) => path.startsWith(prefix));
  }

  async deletePath(path: string): Promise<void> {
    this.docs.delete(path);
  }
}
