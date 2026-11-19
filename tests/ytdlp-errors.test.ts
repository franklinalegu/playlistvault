import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { humanizeYtDlpError, runYtDlpCollect } from '../backend/download/ytdlp';
import { buildDownloadArgs, buildAnalyzeArgs, buildFormatProbeArgs } from '../backend/download/formats';
import { DEFAULT_DOWNLOAD_OPTIONS } from '../shared/types';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: spawnMock, default: { ...actual, spawn: spawnMock } };
});
vi.mock('../backend/ffmpeg/binaries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../backend/ffmpeg/binaries')>();
  return { ...actual, resolveBinaries: () => ({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }) };
});

type FakeChild = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  pid: number;
  killed: boolean;
  exitCode: number | null;
};

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 4242;
  child.killed = false;
  child.exitCode = null;
  return child;
}

describe('runYtDlpCollect — humanize exactly once', () => {
  it('keeps a content error instead of relabelling it as an antivirus/lock failure', async () => {
    spawnMock.mockImplementation(() => {
      const child = fakeChild();
      setImmediate(() => {
        child.stderr.write('ERROR: [youtube] dQw4w9WgXcQ: Video unavailable\n');
        child.stderr.end();
        child.emit('close', 1);
      });
      return child;
    });

    const err = await runYtDlpCollect(['https://www.youtube.com/watch?v=dQw4w9WgXcQ']).promise
      .then(() => null)
      .catch((e: Error) => e);

    expect(err?.message).toMatch(/unavailable or has been removed/i);
    expect(err?.message).not.toMatch(/could not be launched|antivirus|currently in use/i);
  });
});

describe('humanizeYtDlpError — YouTube anti-bot & transport', () => {
  it('maps HTTP 403 to actionable update+cookies hint', () => {
    const msg = humanizeYtDlpError('ERROR: unable to download video data: HTTP Error 403: Forbidden', 1);
    expect(msg).toMatch(/403/i);
    expect(msg).toMatch(/update yt-dlp/i);
    expect(msg).toMatch(/signed-in/i);
  });

  it('maps 403 Forbidden envelope', () => {
    expect(humanizeYtDlpError('HTTP Error 403: Forbidden', 1)).toMatch(/403/);
  });

  it('maps PO Token / visitor data to signature hint', () => {
    expect(humanizeYtDlpError('ERROR: PO Token or visitorData is missing', 1)).toMatch(/signature/i);
    expect(humanizeYtDlpError('ERROR: visitor data required', 1)).toMatch(/yt-dlp/i);
  });

  it('maps Chrome cookie lock to close-browser hint', () => {
    const msg = humanizeYtDlpError('ERROR: Could not copy Chrome cookie database', 1);
    expect(msg).toMatch(/close the browser/i);
    expect(msg).toMatch(/cookies\.txt/i);
  });

  it('maps bot challenge to browser sign-in hint', () => {
    const msg = humanizeYtDlpError('ERROR: Sign in to confirm you’re not a bot', 1);
    expect(msg).toMatch(/browser sign-in required/i);
  });

  it('still maps 429 to rate-limit', () => {
    expect(humanizeYtDlpError('HTTP Error 429 Too Many Requests', 1)).toMatch(/rate-limit/i);
  });

  it('maps spawn EBUSY to transient lock hint (never generic "failed to start")', () => {
    const msg = humanizeYtDlpError('spawn EBUSY', -1);
    expect(msg).toMatch(/currently in use or locked/i);
    expect(msg).not.toMatch(/failed to start/i);
  });

  it('maps Windows crash codes to quarantine/reinstall hint', () => {
    expect(humanizeYtDlpError('', 3221225794)).toMatch(/crashed on launch|antivirus|reinstall/i);
    expect(humanizeYtDlpError('', 1073807364)).toMatch(/crashed on launch|antivirus|reinstall/i);
  });

  it('fallback for unknown spawn failure names antivirus/lock, not the raw exit code', () => {
    const msg = humanizeYtDlpError('', -1);
    expect(msg).toMatch(/antivirus|locked|reinstall/i);
    expect(msg).not.toMatch(/4294967295/);
  });
});

describe('buildDownloadArgs proxy auth', () => {
  const base = {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    outputTemplate: 'C:\\out\\01.%(ext)s',
    options: { ...DEFAULT_DOWNLOAD_OPTIONS },
    ffmpegPath: 'C:\\bin\\ffmpeg.exe'
  };

  it('includes username/password in --proxy when provided', () => {
    const args = buildDownloadArgs({
      ...base,
      proxy: { enabled: true, type: 'http', host: 'proxy.example.com', port: 8080, username: 'user', password: 'p@ss' }
    });
    const idx = args.indexOf('--proxy');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('http://user:p%40ss@proxy.example.com:8080');
  });

  it('encodes special chars in proxy credentials', () => {
    const args = buildDownloadArgs({
      ...base,
      proxy: { enabled: true, type: 'socks5', host: '10.0.0.1', port: 1080, username: 'a/b', password: 'c:d' }
    });
    expect(args[args.indexOf('--proxy') + 1]).toContain(encodeURIComponent('a/b'));
  });

  it('omits auth when no username', () => {
    const args = buildDownloadArgs({
      ...base,
      proxy: { enabled: true, type: 'http', host: 'proxy.example.com', port: 8080, username: '', password: '' }
    });
    expect(args[args.indexOf('--proxy') + 1]).toBe('http://proxy.example.com:8080');
  });

  it('does not emit --proxy when disabled', () => {
    const args = buildDownloadArgs({ ...base, proxy: { enabled: false, type: 'http', host: 'x', port: 8080, username: '', password: '' } });
    expect(args).not.toContain('--proxy');
  });
});

describe('buildAnalyzeArgs & buildFormatProbeArgs proxy', () => {
  it('buildAnalyzeArgs forwards proxy auth', () => {
    const args = buildAnalyzeArgs('https://www.youtube.com/playlist?list=PLx', 'none', {
      enabled: true, type: 'http', host: 'h', port: 3128, username: 'u', password: 'p'
    });
    expect(args[args.indexOf('--proxy') + 1]).toContain('u:p@h:3128');
  });

  it('buildFormatProbeArgs forwards proxy and cookies', () => {
    const args = buildFormatProbeArgs('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'chrome', 'C:\\cookies.txt', {
      enabled: true, type: 'http', host: 'h', port: 3128, username: 'u', password: 'p'
    });
    expect(args).toContain('--cookies-from-browser');
    expect(args).toContain('--cookies');
    expect(args).toContain('--proxy');
  });
});
