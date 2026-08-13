import { useState } from 'react';
import { FiFileText, FiLink, FiX } from 'react-icons/fi';
import { useToast } from '@/contexts/ToastContext';

interface BatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (urls: string[]) => void;
}

export function BatchImportModal({ isOpen, onClose, onImport }: BatchImportModalProps): JSX.Element | null {
  const [text, setText] = useState('');
  const [parsedUrls, setParsedUrls] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const { success, error } = useToast();

  if (!isOpen) return null;

  const handleParseUrls = async (): Promise<void> => {
    if (!text.trim()) {
      error('No text', 'Paste some text containing YouTube or Udemy links first.');
      return;
    }
    setParsing(true);
    const res = await window.vault.batch.importUrls(text);
    setParsing(false);
    if (res.ok) {
      setParsedUrls(res.data);
      if (res.data.length === 0) {
        error('No URLs found', 'No YouTube or Udemy links were detected in the provided text.');
      }
    } else {
      error('Parse failed', res.error);
    }
  };

  const handleFileImport = async (): Promise<void> => {
    setParsing(true);
    const res = await window.vault.batch.parseFile();
    setParsing(false);
    if (res.ok && res.data) {
      setText(res.data);
      // Auto-parse the file content
      const parseRes = await window.vault.batch.importUrls(res.data);
      if (parseRes.ok) {
        setParsedUrls(parseRes.data);
        success('File loaded', `Found ${parseRes.data.length} URLs in the file.`);
      }
    } else if (!res.ok) {
      error('File read failed', res.error);
    }
  };

  const handleImport = (): void => {
    if (parsedUrls.length === 0) {
      error('No URLs', 'No URLs to import. Parse some URLs first.');
      return;
    }
    onImport(parsedUrls);
    success('Imported', `${parsedUrls.length} URLs ready for analysis.`);
    setText('');
    setParsedUrls([]);
    onClose();
  };

  const handleClose = (): void => {
    setText('');
    setParsedUrls([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass mx-4 w-full max-w-lg rounded-2xl border border-white/10 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Batch Import URLs</h3>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-slate-400">
          Paste text containing YouTube or Udemy playlist, course or video URLs, or import from a
          text file. All valid URLs will be detected and queued for analysis.
        </p>

        <div className="mb-4">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setParsedUrls([]);
            }}
            placeholder="Paste YouTube or Udemy URLs here...&#10;&#10;Example:&#10;https://www.youtube.com/playlist?list=PLxxxx&#10;https://www.udemy.com/course/example-course/&#10;https://youtu.be/xxxxxx"
            className="input min-h-[120px] w-full resize-y font-mono text-xs"
            rows={6}
          />
        </div>

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => void handleParseUrls()}
            disabled={parsing || !text.trim()}
            className="btn-primary flex-1"
          >
            <FiLink className="h-4 w-4" />
            {parsing ? 'Parsing…' : 'Parse URLs'}
          </button>
          <button
            onClick={() => void handleFileImport()}
            disabled={parsing}
            className="btn-ghost"
          >
            <FiFileText className="h-4 w-4" />
            Import from file
          </button>
        </div>

        {parsedUrls.length > 0 && (
          <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
            <p className="mb-2 text-xs font-medium text-emerald-300">
              Found {parsedUrls.length} URL{parsedUrls.length !== 1 ? 's' : ''}
            </p>
            <div className="max-h-[120px] space-y-1 overflow-y-auto">
              {parsedUrls.map((url, i) => (
                <div key={i} className="truncate font-mono text-[11px] text-slate-400">
                  {url}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={handleClose} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={parsedUrls.length === 0}
            className="btn-primary"
          >
            Import {parsedUrls.length > 0 ? `(${parsedUrls.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
