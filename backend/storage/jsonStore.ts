import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * A tiny atomic JSON store.
 *
 * Writes go to a temp file and are renamed into place, so a crash or power
 * loss mid-write can never leave a truncated settings/history file behind.
 * Writes are also serialised per-instance to avoid interleaving.
 */
export class JsonStore<T> {
  private readonly filePath: string;
  private readonly defaults: T;
  private cache: T | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(filePath: string, defaults: T) {
    this.filePath = filePath;
    this.defaults = defaults;
  }

  get path(): string {
    return this.filePath;
  }

  read(): T {
    if (this.cache) return this.cache;
    try {
      const text = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(text) as T;
      this.cache = this.merge(parsed);
    } catch {
      // Missing or corrupt file: fall back to defaults rather than crashing.
      this.cache = structuredClone(this.defaults);
    }
    return this.cache;
  }

  async write(next: T): Promise<void> {
    this.cache = next;
    this.writeChain = this.writeChain.then(() => this.writeNow(next)).catch(() => undefined);
    return this.writeChain;
  }

  async update(mutator: (current: T) => T): Promise<T> {
    const next = mutator(this.read());
    await this.write(next);
    return next;
  }

  async reset(): Promise<T> {
    const fresh = structuredClone(this.defaults);
    await this.write(fresh);
    return fresh;
  }

  private merge(parsed: T): T {
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...(this.defaults as object), ...(parsed as object) } as T;
    }
    return parsed ?? structuredClone(this.defaults);
  }

  private async writeNow(value: T): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fsp.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fsp.rename(tmp, this.filePath);
  }
}
