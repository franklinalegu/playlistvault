import { useCallback, useRef, useState } from 'react';
import type { PlaylistInfo, VideoQuality } from '@shared/types';

interface AnalyzerState {
  playlist: PlaylistInfo | null;
  loading: boolean;
  error: string | null;
}

export function useAnalyzer(): AnalyzerState & {
  analyze: (url: string, quality: VideoQuality) => Promise<PlaylistInfo | null>;
  cancel: () => void;
  clear: () => void;
} {
  const [state, setState] = useState<AnalyzerState>({
    playlist: null,
    loading: false,
    error: null
  });
  // Guards against a stale response overwriting a newer one.
  const requestId = useRef(0);

  const analyze = useCallback(async (url: string, quality: VideoQuality) => {
    const id = ++requestId.current;
    setState({ playlist: null, loading: true, error: null });

    const res = await window.vault.playlist.analyze({ url, quality });
    if (id !== requestId.current) return null;

    if (res.ok) {
      setState({ playlist: res.data, loading: false, error: null });
      return res.data;
    }
    setState({ playlist: null, loading: false, error: res.error });
    return null;
  }, []);

  const cancel = useCallback(() => {
    requestId.current += 1;
    void window.vault.playlist.cancelAnalyze();
    setState((s) => ({ ...s, loading: false }));
  }, []);

  const clear = useCallback(() => {
    requestId.current += 1;
    setState({ playlist: null, loading: false, error: null });
  }, []);

  return { ...state, analyze, cancel, clear };
}
