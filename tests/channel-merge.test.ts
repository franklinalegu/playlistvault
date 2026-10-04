import { describe, expect, it } from 'vitest';
import { mergeChannelVideos } from '../backend/playlist/analyzer';
import type { PlaylistVideo } from '../shared/types';

function video(id: string, over: Partial<PlaylistVideo> = {}): PlaylistVideo {
  return {
    id,
    title: `Title ${id}`,
    durationSeconds: 60,
    url: `https://www.youtube.com/watch?v=${id}`,
    index: 1,
    isAvailable: true,
    ...over
  };
}

describe('mergeChannelVideos', () => {
  it('keeps every unique video across shelves', () => {
    const { videos, duplicateCount } = mergeChannelVideos([
      [video('a', { section: 'uploads' }), video('b', { section: 'uploads' })],
      [video('c', { section: 'podcast', playlistTitle: 'My Podcast' })]
    ]);
    expect(videos.map((v) => v.id)).toEqual(['a', 'b', 'c']);
    expect(duplicateCount).toBe(0);
  });

  it('drops repeats so a video in uploads and a course downloads once', () => {
    const { videos, duplicateCount } = mergeChannelVideos([
      [video('a', { section: 'uploads' }), video('b', { section: 'uploads' })],
      [video('b', { section: 'course', playlistTitle: 'Course 101' }), video('c', { section: 'course' })],
      [video('a', { section: 'podcast' })]
    ]);
    expect(videos.map((v) => v.id)).toEqual(['a', 'b', 'c']);
    expect(duplicateCount).toBe(2);
  });

  it('first occurrence wins, keeping the uploads section', () => {
    const { videos } = mergeChannelVideos([
      [video('a', { section: 'uploads' })],
      [video('a', { section: 'podcast', playlistTitle: 'Show' })]
    ]);
    expect(videos).toHaveLength(1);
    expect(videos[0].section).toBe('uploads');
    expect(videos[0].playlistTitle).toBeUndefined();
  });

  it('renumbers the merged archive sequentially', () => {
    const { videos } = mergeChannelVideos([
      [video('a'), video('b')],
      [video('c')]
    ]);
    expect(videos.map((v) => v.index)).toEqual([1, 2, 3]);
  });

  it('handles empty shelves', () => {
    const { videos, duplicateCount } = mergeChannelVideos([[], [video('a')], []]);
    expect(videos.map((v) => v.id)).toEqual(['a']);
    expect(duplicateCount).toBe(0);
  });
});
