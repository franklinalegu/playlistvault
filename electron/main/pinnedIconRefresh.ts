import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { log } from '@backend/util/logger.js';

const ICON_VERSION = '6.0.3'; // bump when icon changes — forces recreation for all users

function versionGte(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return true;
    if (da < db) return false;
  }
  return true;
}

function writeLnk(targetPath: string, exePath: string): void {
  try {
    // Delete stale .lnk first — Windows caches the old icon index otherwise
    try { if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true }); } catch { /* ignore */ }
    // Use 'create' after delete; fall back to 'update' if needed
    let ok = shell.writeShortcutLink(targetPath, 'create', {
      target: exePath,
      icon: exePath,
      iconIndex: 0,
      description: 'PlaylistVault',
      appUserModelId: 'app.playlistvault.desktop'
    });
    if (!ok) {
      // Some systems require 'update'
      ok = shell.writeShortcutLink(targetPath, 'update', {
        target: exePath,
        icon: exePath,
        iconIndex: 0,
        description: 'PlaylistVault',
        appUserModelId: 'app.playlistvault.desktop'
      });
    }
    if (ok) log.info('pinned-refresh', `updated shortcut ${targetPath}`);
    else log.warn('pinned-refresh', `writeShortcutLink failed for ${targetPath}`);
  } catch (e) {
    log.warn('pinned-refresh', `shortcut write error ${targetPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function refreshIconCache(): void {
  if (process.platform !== 'win32') return;
  try {
    // Aggressive but safe: ie4uinit -ClearIconCache + SHChangeNotify + delete IconCache.db
    const localAppData = process.env.LOCALAPPDATA ?? '';
    if (localAppData) {
      for (const name of ['IconCache.db', 'IconCache_*.db']) {
        // Delete Explorer icon caches — they regenerate on next explorer start
        try {
          const pattern = path.join(localAppData, name);
          // Expand wildcard manually
          if (name.includes('*')) {
            const dir = path.dirname(pattern);
            const base = path.basename(pattern).replace('*', '');
            if (fs.existsSync(dir)) {
              for (const f of fs.readdirSync(dir)) {
                if (f.startsWith('IconCache') && f.endsWith('.db')) {
                  try { fs.rmSync(path.join(dir, f), { force: true }); } catch { /* ignore */ }
                }
              }
            }
          } else if (fs.existsSync(pattern)) {
            fs.rmSync(pattern, { force: true });
          }
        } catch { /* ignore */ }
        // Also Explorer subfolder
        try {
          const expDir = path.join(localAppData, 'Microsoft', 'Windows', 'Explorer');
          if (fs.existsSync(expDir)) {
            for (const f of fs.readdirSync(expDir)) {
              if (f.startsWith('iconcache') || f.startsWith('thumbcache')) {
                try { fs.rmSync(path.join(expDir, f), { force: true }); } catch { /* ignore */ }
              }
            }
          }
        } catch { /* ignore */ }
      }
    }
    // Trigger shell notification
    const p1 = spawn('ie4uinit.exe', ['-show'], { windowsHide: true, stdio: 'ignore' });
    p1.on('error', () => {
      spawn('ie4uinit.exe', ['-ClearIconCache'], { windowsHide: true, stdio: 'ignore' });
    });
    // Additional SHChangeNotify
    spawn('powershell', ['-NoProfile', '-Command', 'Add-Type -MemberDefinition \'[DllImport("shell32.dll")] public static extern void SHChangeNotify(int wEventId,int uFlags,IntPtr d1,IntPtr d2);\' -Name W -Namespace S; [S.W]::SHChangeNotify(0x08000000,0,0,0)'], { windowsHide: true, stdio: 'ignore' });
    log.info('pinned-refresh', 'icon cache refresh triggered (delete + ie4uinit + SHChangeNotify)');
  } catch (e) {
    log.warn('pinned-refresh', `cache refresh failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function forceRefreshPinnedIcon(): void {
  if (process.platform !== 'win32') return;
  // Allow in dev when testing locally — still refresh if the new icon file exists
  if (!app.isPackaged) {
    log.info('pinned-refresh', 'running in dev — will still refresh if exe exists');
  }
  const exePath = process.execPath;
  const currentVer = app.getVersion();
  // Only force from the icon-change version onwards
  if (!versionGte(currentVer, ICON_VERSION)) return;

  const userData = app.getPath('userData');
  const marker = path.join(userData, `.icon-refreshed-${ICON_VERSION}`);
  // Re-run if marker missing OR shortcut still points to old icon — delete stale marker to force retry
  // Check existing desktop shortcut target — if it doesn't match current exe, force refresh
  const desktopLnk = path.join(app.getPath('desktop'), 'PlaylistVault.lnk');
  let stale = false;
  try {
    if (fs.existsSync(desktopLnk)) {
      const link = shell.readShortcutLink(desktopLnk);
      if (link.target !== exePath || link.icon !== exePath) stale = true;
    } else {
      stale = true;
    }
  } catch { stale = true; }
  if (fs.existsSync(marker) && !stale) {
    return;
  }
  if (stale && fs.existsSync(marker)) {
    try { fs.rmSync(marker, { force: true }); } catch { /* ignore */ }
    log.info('pinned-refresh', 'stale shortcut detected — forcing re-refresh');
  }

  log.info('pinned-refresh', `forcing pinned icon refresh for ${currentVer} (icon ${ICON_VERSION})`);

  // 1) Desktop shortcut (current user)
  try {
    const desktop = app.getPath('desktop');
    const desktopLnk = path.join(desktop, 'PlaylistVault.lnk');
    // Always recreate — NSIS may have left old icon index
    writeLnk(desktopLnk, exePath);
  } catch (e) {
    log.warn('pinned-refresh', `desktop refresh failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) Per-user pinned Taskbar + Start Menu shortcuts
  const appData = app.getPath('appData');
  const candidates = [
    path.join(appData, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar', 'PlaylistVault.lnk'),
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'PlaylistVault.lnk'),
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Franklin Alegu (FA)', 'PlaylistVault.lnk'),
  ];
  // Also check common AppData if installed per-machine
  try {
    const programData = process.env.ProgramData ?? 'C:\\ProgramData';
    candidates.push(path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'PlaylistVault.lnk'));
  } catch { /* ignore */ }

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      writeLnk(p, exePath);
    }
  }

  // 3) Try to update ALL users' desktops if we have permission (requires admin, best-effort)
  try {
    // app.getPath('desktop') is C:\Users\<user>\Desktop, parent is user folder, grandparent is Users
    const usersDir = path.resolve(app.getPath('home'), '..');
    if (fs.existsSync(usersDir)) {
      for (const entry of fs.readdirSync(usersDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (['All Users', 'Default', 'Default User', 'Public'].includes(entry.name)) continue;
        const otherDesktop = path.join(usersDir, entry.name, 'Desktop', 'PlaylistVault.lnk');
        if (fs.existsSync(otherDesktop)) {
          try {
            writeLnk(otherDesktop, exePath);
          } catch { /* per-user permission may fail */ }
        }
      }
    }
  } catch { /* ignore — not admin */ }

  refreshIconCache();

  // Mark done for this user so we don't redo every launch
  try {
    fs.writeFileSync(marker, `${currentVer}\n${new Date().toISOString()}\n`);
  } catch { /* ignore */ }
  log.info('pinned-refresh', 'done');
}
