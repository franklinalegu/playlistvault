/**
 * Web library folder: let the user pick where files live, save into it, and
 * browse what's there. Built on the File System Access API (Chromium/Edge/Safari
 * 15.2+); Firefox and iOS Chrome fall back to plain browser downloads.
 *
 * The picked directory handle is persisted in IndexedDB so the app remembers
 * the library across reloads (permission is re-requested with a gesture-safe
 * `queryPermission` fast path).
 */

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
    showSaveFilePicker?: (opts?: {
      suggestedName?: string;
      types?: { description?: string; accept?: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle>;
  }
}

interface PermissionedHandle {
  queryPermission?: (desc?: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (desc?: { mode: string }) => Promise<PermissionState>;
}

export function supportsLibraryFolder(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('pv-web-library', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction('kv', 'readonly');
      const rq = tx.objectStore('kv').get(key);
      rq.onsuccess = () => resolve((rq.result as T | undefined) ?? null);
      rq.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => resolve();
    });
  } catch {
    /* private mode etc. — library just won't persist */
  }
}

async function hasAccess(handle: FileSystemHandle, write: boolean): Promise<boolean> {
  const h = handle as unknown as PermissionedHandle;
  const mode = write ? 'readwrite' : 'read';
  try {
    if (h.queryPermission) {
      if ((await h.queryPermission({ mode })) === 'granted') return true;
    }
    if (h.requestPermission) {
      return (await h.requestPermission({ mode })) === 'granted';
    }
  } catch {
    return false;
  }
  return true;
}

/** Restore the previously picked library folder (no gesture needed if granted). */
export async function getLibraryDir(write: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsLibraryFolder()) return null;
  const handle = await idbGet<FileSystemDirectoryHandle>('libraryDir');
  if (!handle) return null;
  try {
    return (await hasAccess(handle, write)) ? handle : null;
  } catch {
    return null;
  }
}

/** Ask the user to pick a library folder (must run in a click handler). */
export async function pickLibraryDir(): Promise<string | null> {
  if (!supportsLibraryFolder() || !window.showDirectoryPicker) return null;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (!(await hasAccess(handle, true))) return handle.name;
    await idbSet('libraryDir', handle);
    return handle.name;
  } catch (e) {
    // AbortError = user cancelled the picker.
    if ((e as Error)?.name === 'AbortError') return null;
    return null;
  }
}

export async function forgetLibraryDir(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete('libraryDir');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => resolve();
    });
  } catch {
    /* noop */
  }
}

const VIDEO_EXT = new Set(['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v']);
const AUDIO_EXT = new Set(['mp3', 'm4a', 'opus', 'flac', 'wav', 'ogg']);

export interface LibFile {
  /** Library-relative path, e.g. "My Playlist/video.mp4" or "video.mp4". */
  path: string;
  name: string;
  size: number;
  modified: number;
  ext: string;
  kind: 'video' | 'audio' | 'other';
}

async function fileEntries(dir: FileSystemDirectoryHandle, prefix: string, out: LibFile[]): Promise<void> {
  // `values()` is missing from this TS lib version — structural cast instead.
  const values = (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
  for await (const entry of values) {
    if (entry.kind === 'file') {
      try {
        const file = await (entry as unknown as FileSystemFileHandle).getFile();
        const ext = (file.name.split('.').pop() ?? '').toLowerCase();
        out.push({
          path: prefix ? `${prefix}/${file.name}` : file.name,
          name: file.name,
          size: file.size,
          modified: file.lastModified,
          ext,
          kind: VIDEO_EXT.has(ext) ? 'video' : AUDIO_EXT.has(ext) ? 'audio' : 'other',
        });
      } catch {
        /* unreadable entry — skip */
      }
    } else if (entry.kind === 'directory' && prefix.split('/').filter(Boolean).length < 2) {
      // Two levels: Channel / Playlist / file (desktop channel archive parity).
      try {
        const sub = await dir.getDirectoryHandle(entry.name);
        await fileEntries(sub as unknown as FileSystemDirectoryHandle, prefix ? `${prefix}/${entry.name}` : entry.name, out);
      } catch {
        /* skip */
      }
    }
  }
}

/** Browse media files in the picked library folder (video + audio). */
export async function listLibraryFiles(): Promise<LibFile[]> {
  const dir = await getLibraryDir(false);
  if (!dir) return [];
  const out: LibFile[] = [];
  try {
    await fileEntries(dir, '', out);
  } catch {
    return [];
  }
  return out
    .filter((f) => f.kind !== 'other')
    .sort((a, b) => b.modified - a.modified);
}

/** Save bytes into the library folder, optionally inside a subfolder. */
export async function writeLibraryFile(
  filename: string,
  data: BlobPart[],
  type: string,
  subfolder?: string
): Promise<string | null> {
  const dir = await getLibraryDir(true);
  if (!dir) return null;
  try {
    let target = dir;
    if (subfolder) {
      for (const part of subfolder.split('/').filter(Boolean)) {
        target = (await target.getDirectoryHandle(part, { create: true })) as unknown as FileSystemDirectoryHandle;
      }
    }
    const fh = await target.getFileHandle(filename, { create: true });
    const writable = await fh.createWritable();
    await writable.write(new Blob(data, { type }));
    await writable.close();
    return subfolder ? `${subfolder}/${filename}` : filename;
  } catch {
    return null;
  }
}

/** Read a library file back (for in-app playback). Caller revokes the URL. */
export async function readLibraryFile(libraryPath: string): Promise<Blob | null> {
  const dir = await getLibraryDir(false);
  if (!dir) return null;
  try {
    const parts = libraryPath.split('/').filter(Boolean);
    let target = dir;
    for (const part of parts.slice(0, -1)) {
      target = (await target.getDirectoryHandle(part)) as unknown as FileSystemDirectoryHandle;
    }
    const fh = await target.getFileHandle(parts[parts.length - 1] as string);
    return await fh.getFile();
  } catch {
    return null;
  }
}
