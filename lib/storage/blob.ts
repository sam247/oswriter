import { del, list, put } from "@vercel/blob";
import type { StorageAdapter } from "@/lib/storage/storage";

export class BlobStorageAdapter implements StorageAdapter {
  async getJson<T>(path: string): Promise<T | null> {
    const found = await this.find(path);
    if (!found) return null;
    const res = await fetch(found.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Blob read failed for ${path}: ${res.status}`);
    return res.json() as Promise<T>;
  }

  async putJson<T>(path: string, value: T): Promise<void> {
    await this.put(path, JSON.stringify(value, null, 2), "application/json");
  }

  async putJsonIfAbsent<T>(path: string, value: T): Promise<boolean> {
    try {
      await put(path, JSON.stringify(value, null, 2), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: false
      } as never);
      return true;
    } catch (error) {
      const existing = await this.find(path).catch(() => null);
      if (existing) return false;
      throw error;
    }
  }

  async putText(path: string, value: string): Promise<void> {
    await this.put(path, value, "text/markdown; charset=utf-8");
  }

  async listJson<T>(prefix: string): Promise<T[]> {
    const page = await list({ prefix, limit: 1000 });
    const jsonBlobs = page.blobs.filter((blob) => blob.pathname.endsWith(".json"));
    const docs = await Promise.all(jsonBlobs.map(async (blob) => {
      const res = await fetch(blob.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Blob list read failed for ${blob.pathname}: ${res.status}`);
      return res.json() as Promise<T>;
    }));
    return docs;
  }

  async listPaths(prefix: string): Promise<string[]> {
    const page = await list({ prefix, limit: 1000 });
    return page.blobs.map((blob) => blob.pathname);
  }

  async deletePath(path: string): Promise<void> {
    await del(path);
  }

  private async find(path: string) {
    const page = await list({ prefix: path, limit: 10 });
    return page.blobs.find((blob) => blob.pathname === path) ?? null;
  }

  private async put(path: string, body: string, contentType: string) {
    await put(path, body, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true
    } as never);
  }
}
