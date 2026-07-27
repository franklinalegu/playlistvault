import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';

/**
 * Reproduces the Home page's destination logic in isolation.
 *
 * The bug: the effect used `setDestination(d => d || settingsDefault)`, so once
 * any value existed (including the initial default) a newly chosen preferred
 * drive in Settings was silently ignored on the Home page.
 */
function useDestination(settingsDefault: string) {
  const [destination, setDestination] = useState(settingsDefault);
  const overridden = useRef(false);

  useEffect(() => {
    if (overridden.current) return;
    if (settingsDefault) setDestination(settingsDefault);
  }, [settingsDefault]);

  return {
    destination,
    pickManually: (dir: string) => { overridden.current = true; setDestination(dir); },
    afterQueue: () => { overridden.current = false; }
  };
}

/** The original, buggy behaviour — kept to prove the test detects it. */
function useDestinationOld(settingsDefault: string) {
  const [destination, setDestination] = useState(settingsDefault);
  useEffect(() => {
    setDestination((d) => d || settingsDefault);
  }, [settingsDefault]);
  return { destination };
}

describe('Home destination follows the preferred folder', () => {
  it('picks up a new default set in Settings', () => {
    const { result, rerender } = renderHook(
      ({ d }) => useDestination(d),
      { initialProps: { d: 'C:\\Users\\Me\\Downloads' } }
    );
    expect(result.current.destination).toBe('C:\\Users\\Me\\Downloads');

    rerender({ d: 'D:\\Videos' });
    expect(result.current.destination).toBe('D:\\Videos');
  });

  it('the old implementation ignored the change (regression guard)', () => {
    const { result, rerender } = renderHook(
      ({ d }) => useDestinationOld(d),
      { initialProps: { d: 'C:\\Users\\Me\\Downloads' } }
    );
    rerender({ d: 'D:\\Videos' });
    // Demonstrates the reported bug.
    expect(result.current.destination).toBe('C:\\Users\\Me\\Downloads');
  });

  it('keeps a manual per-download choice over the saved default', () => {
    const { result, rerender } = renderHook(
      ({ d }) => useDestination(d),
      { initialProps: { d: 'C:\\Downloads' } }
    );
    act(() => result.current.pickManually('E:\\OneOff'));
    expect(result.current.destination).toBe('E:\\OneOff');

    rerender({ d: 'D:\\Videos' });
    expect(result.current.destination).toBe('E:\\OneOff');
  });

  it('resumes following the default after a job is queued', () => {
    const { result, rerender } = renderHook(
      ({ d }) => useDestination(d),
      { initialProps: { d: 'C:\\Downloads' } }
    );
    act(() => result.current.pickManually('E:\\OneOff'));
    act(() => result.current.afterQueue());

    rerender({ d: 'D:\\Videos' });
    expect(result.current.destination).toBe('D:\\Videos');
  });

  it('ignores an empty default', () => {
    const { result, rerender } = renderHook(
      ({ d }) => useDestination(d),
      { initialProps: { d: 'D:\\Videos' } }
    );
    rerender({ d: '' });
    expect(result.current.destination).toBe('D:\\Videos');
  });
});
