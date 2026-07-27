import { FiClock, FiFolder, FiSliders } from 'react-icons/fi';
import type {
  AudioFormat,
  DownloadOptions,
  VideoContainer,
  VideoQuality
} from '@shared/types';
import { Select, Toggle } from './ui';

const QUALITIES: { value: VideoQuality; label: string }[] = [
  { value: 'best', label: 'Best available' },
  { value: '2160p', label: '2160p (4K)' },
  { value: '1440p', label: '1440p (2K)' },
  { value: '1080p', label: '1080p (Full HD)' },
  { value: '720p', label: '720p (HD)' },
  { value: '480p', label: '480p' },
  { value: '360p', label: '360p' }
];

const CONTAINERS: { value: VideoContainer; label: string }[] = [
  { value: 'mp4', label: 'MP4 — most compatible' },
  { value: 'mkv', label: 'MKV — best for subtitles' },
  { value: 'webm', label: 'WebM — smallest' }
];

const AUDIO_FORMATS: { value: AudioFormat; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A (AAC)' },
  { value: 'opus', label: 'Opus' },
  { value: 'flac', label: 'FLAC (lossless)' },
  { value: 'wav', label: 'WAV (uncompressed)' }
];

export function OptionsPanel({
  options,
  onChange,
  destination,
  onChooseFolder,
  recentDestinations = [],
  onPickRecent
}: {
  options: DownloadOptions;
  onChange: (patch: Partial<DownloadOptions>) => void;
  destination: string;
  onChooseFolder: () => void;
  recentDestinations?: string[];
  onPickRecent?: (dir: string) => void;
}): JSX.Element {
  return (
    <section className="glass p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
        <FiSliders className="h-4 w-4 text-accent-300" />
        Download options
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Quality"
          value={options.quality}
          disabled={options.audioOnly}
          onChange={(quality) => onChange({ quality })}
          options={QUALITIES}
        />
        {options.audioOnly ? (
          <Select
            label="Audio format"
            value={options.audioFormat}
            onChange={(audioFormat) => onChange({ audioFormat })}
            options={AUDIO_FORMATS}
          />
        ) : (
          <Select
            label="Container"
            value={options.container}
            onChange={(container) => onChange({ container })}
            options={CONTAINERS}
          />
        )}
      </div>

      <div className="mt-4">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Save to
        </span>
        <div className="flex gap-2">
          <div
            className="input flex-1 truncate py-2.5 text-xs text-slate-400"
            title={destination}
          >
            {destination || 'Choose a folder…'}
          </div>
          <button onClick={onChooseFolder} className="btn-ghost shrink-0 px-3">
            <FiFolder className="h-4 w-4" />
            Browse
          </button>
        </div>

        {recentDestinations.filter((d) => d !== destination).length > 0 && onPickRecent && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <FiClock className="h-3 w-3 shrink-0 text-slate-600" />
            {recentDestinations
              .filter((d) => d !== destination)
              .slice(0, 3)
              .map((dir) => (
                <button
                  key={dir}
                  onClick={() => onPickRecent(dir)}
                  title={dir}
                  className="max-w-[220px] truncate rounded-lg border border-white/10 bg-white/5 px-2 py-1
                             text-[11px] text-slate-400 transition hover:border-accent/40 hover:text-slate-200"
                >
                  {dir.split(/[/\\]/).filter(Boolean).slice(-1)[0] || dir}
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="mt-2 divide-y divide-white/[0.06]">
        <Toggle
          label="Audio only"
          description="Extract the soundtrack and skip video entirely."
          checked={options.audioOnly}
          onChange={(audioOnly) => onChange({ audioOnly })}
        />
        <Toggle
          label="Number files by playlist order"
          description="Prefixes names with 01, 02, 03… so they sort correctly."
          checked={options.numberFiles}
          onChange={(numberFiles) => onChange({ numberFiles })}
        />
        <Toggle
          label="Create a folder for the playlist"
          description="Keeps each playlist in its own tidy subfolder."
          checked={options.createPlaylistFolder}
          onChange={(createPlaylistFolder) => onChange({ createPlaylistFolder })}
        />
        <Toggle
          label="Skip files that already exist"
          description="Re-running a playlist only fetches what is missing."
          checked={options.skipDuplicates}
          onChange={(skipDuplicates) => onChange({ skipDuplicates })}
        />
        <Toggle
          label="Save resource links page"
          description="Writes a clickable HTML index of every source and description link, matched to each file."
          checked={options.writeResourceManifest}
          onChange={(writeResourceManifest) => onChange({ writeResourceManifest })}
        />
        <Toggle
          label="Embed thumbnail"
          checked={options.embedThumbnail}
          onChange={(embedThumbnail) => onChange({ embedThumbnail })}
        />
        <Toggle
          label="Download subtitles"
          description="Embeds available and auto-generated captions."
          checked={options.writeSubtitles}
          disabled={options.audioOnly}
          onChange={(writeSubtitles) => onChange({ writeSubtitles })}
        />
      </div>

      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
            Parallel downloads
            <span className="tabular-nums text-slate-300">{options.concurrency}</span>
          </span>
          <input
            type="range"
            min={1}
            max={6}
            step={1}
            value={options.concurrency}
            onChange={(e) => onChange({ concurrency: Number(e.target.value) })}
            className="w-full accent-accent"
            aria-label="Parallel downloads"
          />
        </label>
        <p className="mt-1.5 text-[11px] text-slate-600">
          Higher values are faster but more likely to trigger rate limiting.
        </p>
      </div>
    </section>
  );
}
