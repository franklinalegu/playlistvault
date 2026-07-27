/**
 * electron-builder afterSign hook.
 *
 * Why this exists: electron-builder derives the Windows CompanyName field from
 * `author.name` in package.json, and npm's author parser treats "Name (text)"
 * as the shorthand `name (url)` form — so the "(FA)" was being silently
 * stripped from the built executable. Copyright and Trademarks are passed
 * through literally and keep it, which made the mismatch easy to miss.
 *
 * Here we re-stamp CompanyName directly on the packaged .exe with rcedit.
 * This must run as `afterSign`, not `afterPack`: electron-builder writes its
 * own version resource between those two stages, so an afterPack edit is
 * silently overwritten before the installer is assembled.
 */
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const COMPANY_NAME = 'Franklin Alegu (FA)';

/**
 * Locate the rcedit binary electron-builder already downloaded.
 *
 * Prefers the ia32 build: when cross-building under Wine the host `wine`
 * binary is frequently 32-bit only, which rejects rcedit-x64 with
 * "Bad EXE format". The ia32 build runs under both.
 */
function findRcedit() {
  const cacheRoot =
    process.env.ELECTRON_BUILDER_CACHE ||
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.cache', 'electron-builder');

  const signDir = path.join(cacheRoot, 'winCodeSign');
  if (!fs.existsSync(signDir)) return null;

  const names = process.platform === 'win32'
    ? ['rcedit-x64.exe', 'rcedit-ia32.exe']
    : ['rcedit-ia32.exe', 'rcedit-x64.exe'];

  for (const entry of fs.readdirSync(signDir)) {
    for (const name of names) {
      const candidate = path.join(signDir, entry, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  if (!fs.existsSync(exePath)) {
    console.warn(`  • afterSign: ${exePath} not found, skipping CompanyName fix`);
    return;
  }

  const rcedit = findRcedit();
  if (!rcedit) {
    console.warn('  • afterSign: rcedit not found in cache, skipping CompanyName fix');
    return;
  }

  const args = [exePath, '--set-version-string', 'CompanyName', COMPANY_NAME];

  try {
    // rcedit is a Windows binary; run it through Wine when cross-building.
    if (process.platform === 'win32') {
      await execFileAsync(rcedit, args, { windowsHide: true });
    } else {
      await execFileAsync('wine', [rcedit, ...args], {
        env: { ...process.env, WINEDEBUG: '-all' },
        maxBuffer: 16 * 1024 * 1024
      });
    }
    console.log(`  • afterSign: CompanyName set to "${COMPANY_NAME}"`);
  } catch (error) {
    // Non-fatal: the app still works, only the metadata field is affected.
    console.warn(`  • afterSign: could not set CompanyName — ${error.message}`);
  }
};
