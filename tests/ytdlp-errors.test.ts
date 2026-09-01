import { describe, expect, it } from 'vitest';
import { humanizeYtDlpError } from '../backend/download/ytdlp';
import { buildDownloadArgs, buildAnalyzeArgs, buildFormatProbeArgs } from '../backend/download/formats';
import { DEFAULT_DOWNLOAD_OPTIONS } from '../shared/types';

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
