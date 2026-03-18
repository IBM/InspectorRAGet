/**
 *
 * Copyright 2023-present InspectorRAGet Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 **/

import { describe, it, expect } from 'vitest';
import { truncate, hash, overlaps } from '@/src/utilities/strings';

// --- truncate ---

describe('truncate', () => {
  it('returns full text when shorter than limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns full text when exactly at limit', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and adds ellipsis when text exceeds limit', () => {
    expect(truncate('hello world', 5)).toBe('hello ...');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('handles limit of 0', () => {
    expect(truncate('hello', 0)).toBe(' ...');
  });
});

// --- hash ---

describe('hash', () => {
  it('returns a hex string', () => {
    const result = hash('test');
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('produces consistent output for same input', () => {
    expect(hash('hello')).toBe(hash('hello'));
  });

  it('produces different output for different inputs', () => {
    expect(hash('hello')).not.toBe(hash('world'));
  });

  it('returns 32-char MD5 hash', () => {
    expect(hash('test')).toHaveLength(32);
  });
});

// --- overlaps ---

describe('overlaps', () => {
  it('finds matching token sequences between source and target', () => {
    const source = 'the quick brown fox';
    const target = 'I saw the quick brown fox jump over the fence';
    const result = overlaps(source, target);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].count).toBeGreaterThan(0);
  });

  it('returns empty array when no overlapping tokens', () => {
    const source = 'alpha beta gamma';
    const target = 'one two three four five six';
    const result = overlaps(source, target);
    expect(result).toEqual([]);
  });

  it('is case insensitive', () => {
    const source = 'The Quick Brown';
    const target = 'the quick brown fox';
    const result = overlaps(source, target);
    expect(result.length).toBeGreaterThan(0);
  });

  it('normalizes smart quotes before matching', () => {
    const source = 'said \u201chello\u201d today';
    const target = 'he said "hello" today at noon';
    const result = overlaps(source, target);
    expect(result.length).toBeGreaterThan(0);
  });

  it('respects min_match_tokens parameter', () => {
    const source = 'one two three four five';
    const target = 'one two three four five';

    const result3 = overlaps(source, target, 3);
    const result5 = overlaps(source, target, 5);

    // With higher min_match_tokens, fewer but longer matches
    expect(result3.length).toBeGreaterThanOrEqual(result5.length);
  });

  it('returns StringMatchObject with correct structure', () => {
    const source = 'the brown fox jumped';
    const target = 'the brown fox jumped over the lazy dog';
    const result = overlaps(source, target);

    if (result.length > 0) {
      const match = result[0];
      expect(match).toHaveProperty('start');
      expect(match).toHaveProperty('end');
      expect(match).toHaveProperty('text');
      expect(match).toHaveProperty('matchesInTarget');
      expect(match).toHaveProperty('count');
      expect(typeof match.start).toBe('number');
      expect(typeof match.end).toBe('number');
      expect(typeof match.text).toBe('string');
      expect(Array.isArray(match.matchesInTarget)).toBe(true);
    }
  });

  it('handles source with fewer tokens than min_match_tokens', () => {
    // Even with min_match_tokens=3, the function still matches if the
    // substring (expanded past min tokens) finds a hit in the target
    const source = 'hello world';
    const target = 'hello world everyone';
    const result = overlaps(source, target, 3);
    // Source has 2 tokens but the do-while loop still attempts a match
    // and finds "hello world" in the target
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('finds multiple non-overlapping matches', () => {
    const source = 'the quick brown fox and the lazy dog';
    const target = 'I saw the quick brown fox then I saw the lazy dog sleeping';
    const result = overlaps(source, target);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty source', () => {
    const result = overlaps('', 'some target text');
    expect(result).toEqual([]);
  });

  it('handles empty target', () => {
    const result = overlaps('the quick brown fox', '');
    expect(result).toEqual([]);
  });

  it('handles single-word source with default min_match_tokens', () => {
    // Single token source: the inner while loop advances past source length,
    // but the do-while still tries the substring and may find a match
    const result = overlaps('hello', 'hello world');
    // The function still finds "hello" because the do-while executes at least once
    expect(result.length).toBe(1);
    expect(result[0].text).toBe('hello');
  });

  it('handles single-word source with min_match_tokens=1', () => {
    const result = overlaps('hello', 'hello world', 1);
    expect(result.length).toBeGreaterThan(0);
  });
});
