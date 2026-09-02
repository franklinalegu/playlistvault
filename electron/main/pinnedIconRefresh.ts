import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { log } from '@backend/util/logger.js';

const ICON_VERSION = '6.0.2'; // bump when icon changes — forces recreation for all users

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
    // shell.writeShortcutLink overwrites the .lnk with correct icon (uses exe's embedded icon)
    const ok = shell.writeShortcutLink(targetPath, 'create', {
      target: exePath,
      icon: exePath,
      iconIndex: 0,
      description: 'PlaylistVault',
      appUserModelId: 'app.playlistvault.desktop'
    });
    if (ok) log.info('pinned-refresh', `updated shortcut ${targetPath}`);
    else log.warn('pinned-refresh', `writeShortcutLink failed for ${targetPath}`);
  } catch (e) {
    log.warn('pinned-refresh', `shortcut write error ${targetPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function refreshIconCache(): void {
  if (process.platform !== 'win32') return;
  try {
    // Windows 10+ : ie4uinit -show refreshes icon cache without killing explorer
    const p = spawn('ie4uinit.exe', ['-show'], { windowsHide: true, stdio: 'ignore' });
    p.on('error', () => {
      // Fallback via PowerShell SHChangeNotify
      spawn('powershell', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Drawing; [System.Runtime.InteropServices.Marshal]::GetLastWin32Error() | Out-Null; $code=@\'\n[DllImport("shell32.dll")] public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);\n\'@; Add-Type -MemberDefinition $code -Name WinApi -Namespace SH; [SH.WinApi]::SHChangeNotify(0x08000000,0,0,0)'], { windowsHide: true, stdio: 'ignore' });
    });
    log.info('pinned-refresh', 'icon cache refresh triggered');
  } catch (e) {
    log.warn('pinned-refresh', `cache refresh failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function forceRefreshPinnedIcon(): void {
  if (process.platform !== 'win32') return;
  if (!app.isPackaged) {
    log.info('pinned-refresh', 'skipped in dev');
    return;
  }
  const exePath = process.execPath;
  const currentVer = app.getVersion();
  // Only force from the icon-change version onwards
  if (!versionGte(currentVer, ICON_VERSION)) return;

  const userData = app.getPath('userData');
  const marker = path.join(userData, `.icon-refreshed-${ICON_VERSION}`);
  if (fs.existsSync(marker)) {
    // Already refreshed for this user with this icon version
    return;
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
