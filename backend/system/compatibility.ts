import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { checkBinaries } from '../ffmpeg/binaries.js';

export interface SystemProfile {
  platform: NodeJS.Platform;
  arch: string;
  osRelease: string;
  osVersion: string;
  cpuCount: number;
  cpuModel: string;
  totalMemGB: number;
  freeMemGB: number;
  diskFreeGB: number | null;
  electron: string;
  chrome: string;
  node: string;
}

export interface CompatibilityCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  recommendation?: string;
  action?: 'downgrade' | 'upgrade' | 'adjust_settings' | 'install_dependency' | 'free_space';
  versionSuggestion?: string;
  link?: string;
}

export interface CompatibilityReport {
  profile: SystemProfile;
  currentVersion: string;
  checks: CompatibilityCheck[];
  overall: 'optimal' | 'compatible' | 'needs_attention' | 'incompatible';
  suggestedVersion: string | null;
  suggestedUrl: string | null;
  autoAppliedFixes: string[];
}

// Version matrix — keep in sync with README/release notes
const VERSION_REQUIREMENTS: Record<string, { minWinBuild: number; minMacOS: string; minRamGB: number; desc: string }> = {
  '6.0.0': { minWinBuild: 10240, minMacOS: '10.15', minRamGB: 4, desc: 'v6 Neo — Windows 10+ (build 10240), macOS 10.15+, 4GB RAM' },
  '5.2.9': { minWinBuild: 9600, minMacOS: '10.13', minRamGB: 2, desc: 'v5.2 — Windows 8.1+, macOS 10.13+, 2GB RAM' },
};

const GITHUB_RELEASES = 'https://github.com/franklinalegu/playlistvault/releases';

function parseWinBuild(release: string): number {
  // os.release() on Windows is like "10.0.22631"
  const parts = release.split('.').map(Number);
  return parts[2] ?? 0;
}

function compareMacOS(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

function getDiskFreeGB(dir: string): number | null {
  try {
    // @ts-ignore — statfsSync exists on Node 19+ but not in all type sets
    const stat = (() => { try { return (fs as unknown as { statfsSync: (p: string) => { bavail: number; bsize: number } }).statfsSync(dir); } catch { return null; } })();
    if (stat) return Math.round((stat.bavail * stat.bsize) / (1024 ** 3));
    return null;
  } catch {
    return null;
  }
}

export async function getSystemProfile(): Promise<SystemProfile> {
  const cpus = os.cpus();
  const userData = (() => { try { return app.getPath('userData'); } catch { return os.homedir(); } })();
  return {
    platform: os.platform(),
    arch: os.arch(),
    osRelease: os.release(),
    // @ts-ignore — os.version exists on Node 18+ but types may not include it in all envs
    osVersion: (() => { try { const v = (os as unknown as { version?: () => string }).version?.(); return v || os.release(); } catch { return os.release(); } })(),
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model ?? 'Unknown',
    totalMemGB: Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10,
    freeMemGB: Math.round((os.freemem() / (1024 ** 3)) * 10) / 10,
    diskFreeGB: getDiskFreeGB(userData),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
  };
}

export async function getCompatibilityReport(): Promise<CompatibilityReport> {
  const profile = await getSystemProfile();
  const currentVersion = (() => { try { return app.getVersion(); } catch { return '0.0.0'; } })();
  const checks: CompatibilityCheck[] = [];
  const autoAppliedFixes: string[] = [];

  // 1) OS — Windows
  if (profile.platform === 'win32') {
    const build = parseWinBuild(profile.osRelease);
    if (build > 0 && build < 10240) {
      checks.push({
        id: 'os-win',
        label: 'Windows version',
        status: 'fail',
        message: `Windows build ${build} — v6 requires Windows 10 (build 10240+)`,
        recommendation: 'Stay on v5.2.9 or upgrade Windows',
        action: 'downgrade',
        versionSuggestion: '5.2.9',
        link: `${GITHUB_RELEASES}/tag/v5.2.9`
      });
    } else if (build > 0 && build < 19041) {
      checks.push({
        id: 'os-win',
        label: 'Windows version',
        status: 'warn',
        message: `Windows build ${build} is older — v6 runs but you may miss OS optimizations`,
        recommendation: 'Update Windows for best performance',
        action: 'upgrade',
        link: 'ms-settings:windowsupdate'
      });
    } else {
      checks.push({ id: 'os-win', label: 'Windows version', status: 'pass', message: `Windows build ${build} — supported` });
    }
    if (profile.arch === 'ia32') {
      checks.push({
        id: 'arch',
        label: 'Architecture',
        status: 'warn',
        message: '32-bit Windows — v6 ships x64 only; use v5.2.9 x32 or upgrade to 64-bit',
        action: 'downgrade',
        versionSuggestion: '5.2.9',
        link: `${GITHUB_RELEASES}/tag/v5.2.9`
      });
    } else {
      checks.push({ id: 'arch', label: 'Architecture', status: 'pass', message: `${profile.arch} — supported` });
    }
  } else if (profile.platform === 'darwin') {
    // macOS version heuristic: os.release() is Darwin version, version() gives marketing version
    const macVer = profile.osVersion.match(/(\d+\.\d+)/)?.[1] ?? '0.0';
    if (compareMacOS(macVer, '10.15') < 0) {
      checks.push({
        id: 'os-mac',
        label: 'macOS version',
        status: 'fail',
        message: `macOS ${macVer} — v6 requires 10.15+`,
        action: 'downgrade',
        versionSuggestion: '5.2.9',
        link: `${GITHUB_RELEASES}/tag/v5.2.9`
      });
    } else if (compareMacOS(macVer, '12.0') < 0) {
      checks.push({ id: 'os-mac', label: 'macOS version', status: 'warn', message: `macOS ${macVer} — v6 works but 12+ recommended` });
    } else {
      checks.push({ id: 'os-mac', label: 'macOS version', status: 'pass', message: `macOS ${macVer} — supported` });
    }
    checks.push({ id: 'arch', label: 'Architecture', status: 'pass', message: `${profile.arch} — supported` });
  } else {
    checks.push({ id: 'os', label: 'OS', status: 'warn', message: `${profile.platform} ${profile.osRelease} — community supported` });
  }

  // 2) RAM
  if (profile.totalMemGB < 2) {
    checks.push({
      id: 'ram',
      label: 'Memory',
      status: 'fail',
      message: `${profile.totalMemGB} GB RAM — minimum 2GB, 4GB recommended for v6`,
      recommendation: 'Close other apps, or use 720p / audio-only and concurrency 1',
      action: 'adjust_settings'
    });
  } else if (profile.totalMemGB < 4) {
    checks.push({
      id: 'ram',
      label: 'Memory',
      status: 'warn',
      message: `${profile.totalMemGB} GB RAM — works, but 4GB+ gives smoother parallel downloads`,
      recommendation: 'Set concurrency to 1 and avoid 2160p on large playlists',
      action: 'adjust_settings'
    });
  } else {
    checks.push({ id: 'ram', label: 'Memory', status: 'pass', message: `${profile.totalMemGB} GB RAM` });
  }

  // 3) Disk
  if (profile.diskFreeGB !== null && profile.diskFreeGB < 5) {
    checks.push({
      id: 'disk',
      label: 'Disk space',
      status: profile.diskFreeGB < 1 ? 'fail' : 'warn',
      message: `${profile.diskFreeGB} GB free where app data lives`,
      recommendation: 'Free space or choose a different download folder',
      action: 'free_space'
    });
  } else if (profile.diskFreeGB === null) {
    checks.push({ id: 'disk', label: 'Disk space', status: 'pass', message: 'Disk check skipped' });
  } else {
    checks.push({ id: 'disk', label: 'Disk space', status: 'pass', message: `${profile.diskFreeGB} GB free` });
  }

  // 4) CPU
  if (profile.cpuCount <= 1) {
    checks.push({ id: 'cpu', label: 'CPU', status: 'warn', message: `1 core (${profile.cpuModel}) — large playlists may be slow`, recommendation: 'Use concurrency 1', action: 'adjust_settings' });
  } else if (profile.cpuCount <= 2) {
    checks.push({ id: 'cpu', label: 'CPU', status: 'pass', message: `${profile.cpuCount} cores` });
  } else {
    checks.push({ id: 'cpu', label: 'CPU', status: 'pass', message: `${profile.cpuCount} cores` });
  }

  // 5) Binaries
  try {
    const bins = await checkBinaries();
    for (const b of bins) {
      if (!b.found) {
        checks.push({
          id: `dep-${b.name}`,
          label: b.name,
          status: 'fail',
          message: `${b.name} not found — ${b.error ?? 'missing'}`,
          recommendation: 'Install from Settings → Dependencies',
          action: 'install_dependency'
        });
      } else {
        checks.push({ id: `dep-${b.name}`, label: b.name, status: 'pass', message: `${b.name} ${b.version ?? ''}` });
      }
    }
  } catch {
    // ignore
  }

  // Overall
  const hasFail = checks.some(c => c.status === 'fail');
  const hasWarn = checks.some(c => c.status === 'warn');
  const overall = hasFail ? 'incompatible' : hasWarn ? 'needs_attention' : 'optimal';
  // Compatible is when no fail but at least one pass — we use needs_attention for warns
  const finalOverall = hasFail ? 'incompatible' : hasWarn ? 'needs_attention' : 'optimal';

  // Suggested version — prefer downgrade if OS fail, else stay current
  let suggestedVersion: string | null = null;
  let suggestedUrl: string | null = null;
  const downgrade = checks.find(c => c.action === 'downgrade' && c.versionSuggestion);
  if (downgrade) {
    suggestedVersion = downgrade.versionSuggestion!;
    suggestedUrl = downgrade.link ?? `${GITHUB_RELEASES}/tag/v${suggestedVersion}`;
  } else if (overall === 'optimal' && currentVersion.startsWith('5.')) {
    // Running old v5 on capable hardware — suggest upgrade
    suggestedVersion = '6.0.4';
    suggestedUrl = `${GITHUB_RELEASES}/tag/v6.0.4`;
    checks.push({
      id: 'upgrade',
      label: 'Upgrade available',
      status: 'warn',
      message: `v${currentVersion} on capable system — v6 is faster and auto-updates yt-dlp`,
      action: 'upgrade',
      versionSuggestion: '6.0.4',
      link: suggestedUrl
    });
  }

  // Auto-applied fixes heuristic (informational — actual applying happens in SettingsService)
  if (profile.totalMemGB < 4) autoAppliedFixes.push('Recommended concurrency 1 for <4GB RAM');
  if (profile.cpuCount <= 2) autoAppliedFixes.push('Recommended quality 1080p max on low-core systems');

  return {
    profile,
    currentVersion,
    checks,
    overall: finalOverall as CompatibilityReport['overall'],
    suggestedVersion,
    suggestedUrl,
    autoAppliedFixes,
  };
}
