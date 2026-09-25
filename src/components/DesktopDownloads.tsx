import { useState } from 'react';
import { FiDownload, FiMonitor, FiSmartphone } from 'react-icons/fi';

type DesktopOs = 'win' | 'mac-intel' | 'mac-arm' | 'android' | 'other';

/** Best-effort OS detection for highlighting the right installer. */
function detectOs(): DesktopOs {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'win';
  if (/Macintosh|Mac OS X/i.test(ua)) {
    // Same heuristic as the marketing site: touch-capable Macs are Apple Silicon.
    return navigator.maxTouchPoints > 1 ? 'mac-arm' : 'mac-intel';
  }
  return 'other';
}

interface Dl {
  os: DesktopOs;
  mark: string;
  title: string;
  sub: string;
  links: { label: string; href: string; primary?: boolean }[];
  highlight?: boolean;
}

/**
 * Every native build, downloadable on request. Used in the web app (About page)
 * so people who started in the browser can grab the full desktop/Android app
 * whenever they want it. URLs match the marketing site and the /download API,
 * which resolves the newest release asset server-side.
 */
export function DesktopDownloads(): JSX.Element {
  const [os] = useState<DesktopOs>(detectOs);

  const items: Dl[] = [
    {
      os: 'win',
      mark: 'W',
      title: 'Windows installer',
      sub: 'Windows 10 and 11 · 64-bit',
      links: [{ label: 'Download .exe', href: '/download', primary: true }],
      highlight: os === 'win',
    },
    {
      os: 'win',
      mark: 'W',
      title: 'Windows portable',
      sub: 'Run without installing',
      links: [{ label: 'Download portable .exe', href: '/download/windows/portable' }],
    },
    {
      os: 'mac-intel',
      mark: '⌘',
      title: 'macOS Intel',
      sub: 'macOS 12+ · Intel Macs',
      links: [
        { label: 'DMG', href: '/download/mac/intel', primary: true },
        { label: 'ZIP', href: '/download/mac/intel/zip' },
      ],
      highlight: os === 'mac-intel',
    },
    {
      os: 'mac-arm',
      mark: '⌘',
      title: 'macOS Apple Silicon',
      sub: 'macOS 12+ · M1, M2, M3, M4',
      links: [
        { label: 'DMG', href: '/download/mac/apple-silicon', primary: true },
        { label: 'ZIP', href: '/download/mac/apple-silicon/zip' },
      ],
      highlight: os === 'mac-arm',
    },
    {
      os: 'android',
      mark: 'A',
      title: 'Android APK',
      sub: 'Android 10+ · Sideload, no Play Store',
      links: [{ label: 'Download .apk', href: '/download/android', primary: true }],
      highlight: os === 'android',
    },
  ];

  return (
    <div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {items.map((d) => (
          <article
            key={`${d.title}-${d.links[0]?.href}`}
            className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 ${
              d.highlight
                ? 'border-accent-400/40 bg-accent-500/[0.08]'
                : 'border-white/[0.08] bg-white/[0.03]'
            }`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-500/15 text-sm font-extrabold text-accent-200">
                {d.os === 'android' ? <FiSmartphone className="h-4 w-4" /> : d.mark}
              </span>
              <div className="min-w-0">
                <h4 className="flex items-center gap-2 truncate text-[13px] font-semibold text-white">
                  {d.title}
                  {d.highlight && (
                    <span className="shrink-0 rounded-full bg-gradient-to-r from-accent-500 to-cyan-400 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-white">
                      THIS DEVICE
                    </span>
                  )}
                </h4>
                <p className="truncate text-[11px] text-slate-500">{d.sub}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {d.links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className={l.primary ? 'btn-primary px-3 py-1 text-xs' : 'btn-ghost px-3 py-1 text-xs'}
                >
                  <FiDownload className="h-3 w-3" />
                  {l.label}
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
      <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
        <FiMonitor className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          Desktop apps bundle yt-dlp + FFmpeg and download straight to your drive. Android: enable{' '}
          <strong className="text-slate-300">Settings → Security → Install unknown apps → Allow</strong>,
          then tap the APK.
        </span>
      </p>
    </div>
  );
}
