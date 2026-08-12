import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiAlertCircle, FiDownload, FiLink, FiSearch, FiX } from 'react-icons/fi';
import type { DownloadOptions, PlaylistInfo } from '@shared/types';
import { estimateBytes } from '@shared/format';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { useQueue } from '@/contexts/QueueContext';
import { useAnalyzer } from '@/hooks/useAnalyzer';
import { PlaylistPanel } from '@/components/PlaylistPanel';
import { OptionsPanel } from '@/components/OptionsPanel';
import { EmptyState, PageShell, ProgressBar } from '@/components/ui';

export function Home(): JSX.Element {
  const { settings, update } = useSettings();
  const { success, error: toastError, toast } = useToast();
  const { refresh } = useQueue();
  const navigate = useNavigate();
  const { playlist, loading, error, analyze, cancel, clear } = useAnalyzer();

  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<DownloadOptions>(settings.defaultOptions);
  const [destination, setDestination] = useState(settings.defaultDestination);
  const [starting, setStarting] = useState(false);

  /**
   * True once the user has picked a folder for *this* download, which stops
   * the saved default from overwriting their one-off choice.
   */
  const destinationOverridden = useRef(false);

  useEffect(() => {
    setOptions(settings.defaultOptions);
  }, [settings.defaultOptions]);

  // Follow the preferred folder from Settings. Previously this used
  // `d || default`, so once any value was set (including the initial one) a
  // newly chosen drive in Settings was silently ignored on this page.
  useEffect(() => {
    if (destinationOverridden.current) return;
    if (settings.defaultDestination) setDestination(settings.defaultDestination);
  }, [settings.defaultDestination]);

  const runAnalysis = useCallback(
    async (target: string) => {
      const trimmed = target.trim();
      if (!trimmed) return;
      const result = await analyze(trimmed, options.quality);
      if (result) {
        setSelected(new Set(result.videos.filter((v) => v.isAvailable).map((v) => v.id)));
      }
    },
    [analyze, options.quality]
  );

  // Clipboard monitoring: offer to load a copied playlist link.
  useEffect(() => {
    if (!settings.clipboardMonitoring) return;
    return window.vault.system.onClipboardUrl((detected) => {
      if (detected === url) return;
      toast({
        kind: 'info',
        title: 'Playlist link copied',
        description: 'Load it in PlaylistVault?',
        action: {
          label: 'Analyze it',
          onClick: () => {
            setUrl(detected);
            void runAnalysis(detected);
          }
        }
      });
    });
  }, [settings.clipboardMonitoring, toast, url, runAnalysis]);

  useEffect(() => {
    return window.vault.system.onProtocolUrl((detected) => {
      setUrl(detected);
      void runAnalysis(detected);
    });
  }, [runAnalysis]);

  // Drag and drop a link straight onto the window.
  useEffect(() => {
    const onDrop = (e: DragEvent): void => {
      e.preventDefault();
      const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
      if (text) {
        setUrl(text.trim());
        void runAnalysis(text.trim());
      }
    };
    const onDragOver = (e: DragEvent): void => e.preventDefault();
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDragOver);
    return () => {
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDragOver);
    };
  }, [runAnalysis]);

  // Ctrl+V anywhere pastes and analyzes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && playlist) {
        void startDownload();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const estimated = useMemo(() => {
    if (!playlist) return 0;
    const seconds = playlist.videos
      .filter((v) => selected.has(v.id))
      .reduce((sum, v) => sum + v.durationSeconds, 0);
    return estimateBytes(seconds, options.audioOnly ? 'audio-only' : options.quality);
  }, [playlist, selected, options.quality, options.audioOnly]);

  /** Remember a folder so it appears as a one-click shortcut next time. */
  const rememberDestination = useCallback(
    (dir: string) => {
      const next = [dir, ...settings.recentDestinations.filter((d) => d !== dir)].slice(0, 6);
      void update({ defaultDestination: dir, recentDestinations: next });
    },
    [settings.recentDestinations, update]
  );

  const chooseFolder = useCallback(async () => {
    const res = await window.vault.system.chooseFolder(destination);
    if (res.ok && res.data) {
      destinationOverridden.current = true;
      setDestination(res.data);
      rememberDestination(res.data);
    } else if (!res.ok) {
      toastError('Could not open folder picker', res.error);
    }
  }, [destination, rememberDestination, toastError]);

  const startDownload = useCallback(async () => {
    if (!playlist || selected.size === 0 || starting) return;
    if (!destination) {
      toastError('Choose a destination folder first');
      return;
    }

    setStarting(true);
    const res = await window.vault.queue.start({
      playlist,
      selectedVideoIds: [...selected],
      destination,
      options
    });
    setStarting(false);

    if (!res.ok) {
      toastError('Could not start download', res.error);
      return;
    }

    rememberDestination(destination);
    destinationOverridden.current = false;
    await refresh();
    success('Added to queue', `${selected.size} video${selected.size > 1 ? 's' : ''} queued.`);
    clear();
    setUrl('');
    setSelected(new Set());
    navigate('/downloads');
  }, [
    playlist, selected, destination, options, starting,
    refresh, success, toastError, clear, navigate, rememberDestination
  ]);

  return (
    <PageShell
      title="Download a playlist"
      subtitle="Paste a YouTube playlist or video link to get started."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runAnalysis(url);
        }}
        className="glass mb-5 flex items-center gap-2 p-2"
      >
        <FiLink className="ml-3 h-4 w-4 shrink-0 text-slate-500" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/playlist?list=…"
          aria-label="Playlist URL"
          autoFocus
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
        />
        {url && (
          <button
            type="button"
            onClick={() => {
              setUrl('');
              clear();
            }}
            aria-label="Clear URL"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
          >
            <FiX className="h-4 w-4" />
          </button>
        )}
        {loading ? (
          <button type="button" onClick={cancel} className="btn-ghost shrink-0">
            Cancel
          </button>
        ) : (
          <button type="submit" disabled={!url.trim()} className="btn-primary shrink-0">
            <FiSearch className="h-4 w-4" />
            Analyze
          </button>
        )}
      </form>

      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass p-5"
          >
            <p className="mb-3 text-sm text-slate-400">Reading playlist…</p>
            <ProgressBar value={0} indeterminate />
            <div className="mt-5 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-9 w-full" />
              ))}
            </div>
          </motion.div>
        )}

        {!loading && error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass flex items-start gap-3 border-rose-500/25 bg-rose-500/[0.07] p-5"
          >
            <FiAlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
            <div>
              <p className="text-sm font-semibold text-rose-200">Could not read that link</p>
              <p className="mt-1 text-xs leading-relaxed text-rose-200/70">{error}</p>
            </div>
          </motion.div>
        )}

        {!loading && !error && !playlist && (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <EmptyState
              icon={<FiDownload />}
              title="Nothing loaded yet"
              description="Paste a link above, drop one onto the window, or copy a playlist URL with clipboard monitoring enabled."
            />
          </motion.div>
        )}

        {!loading && playlist && (
          <motion.div key="loaded" className="space-y-5">
            <PlaylistPanel
              playlist={playlist as PlaylistInfo}
              selected={selected}
              estimatedBytes={estimated}
              onToggle={(id) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onSelectAll={() =>
                setSelected(new Set(playlist.videos.filter((v) => v.isAvailable).map((v) => v.id)))
              }
              onSelectNone={() => setSelected(new Set())}
            />

            <OptionsPanel
              options={options}
              onChange={(patch) => setOptions((prev) => ({ ...prev, ...patch }))}
              destination={destination}
              onChooseFolder={() => void chooseFolder()}
              recentDestinations={settings.recentDestinations}
              onPickRecent={(dir) => {
                destinationOverridden.current = true;
                setDestination(dir);
                rememberDestination(dir);
              }}
            />

            <div className="sticky bottom-0 -mx-8 border-t border-white/[0.07] bg-vault-950/80 px-8 py-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500">
                  {selected.size} of {playlist.videoCount} selected · Ctrl+Enter to start
                </p>
                <button
                  onClick={() => void startDownload()}
                  disabled={selected.size === 0 || starting}
                  className="btn-primary px-6"
                >
                  <FiDownload className="h-4 w-4" />
                  {starting ? 'Starting…' : 'Start download'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageShell>
  );
}
