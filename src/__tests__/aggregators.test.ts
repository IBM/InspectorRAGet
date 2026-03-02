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
import {
  meanAggregator,
  medianAggregator,
  majorityAggregator,
  unionAggregator,
  intersectionAggregator,
  majorityUnionAggregator,
} from '@/src/utilities/aggregators';
import { AggregationConfidenceLevels, MetricValue } from '@/src/types';

// --- Fixtures ---

const numericReferences: MetricValue[] = [
  { value: 'bad', numericValue: 0 },
  { value: 'ok', numericValue: 1 },
  { value: 'good', numericValue: 2 },
  { value: 'great', numericValue: 3 },
];

// --- meanAggregator ---

describe('meanAggregator', () => {
  it('has correct name and displayName', () => {
    expect(meanAggregator.name).toBe('mean');
    expect(meanAggregator.displayName).toBe('Mean');
  });

  it('calculates mean of numeric scores', () => {
    const result = meanAggregator.apply([2, 4, 6], []);
    expect(result.value).toBe(4);
  });

  it('rounds mean to 2 decimal places', () => {
    const result = meanAggregator.apply([1, 2, 3, 4], []);
    expect(result.value).toBe(2.5);
  });

  it('calculates standard deviation', () => {
    // [2, 4, 6]: mean=4, std = sqrt((4+0+4)/3) = sqrt(8/3) ≈ 1.63
    const result = meanAggregator.apply([2, 4, 6], []);
    expect(result.std).toBeCloseTo(1.63, 1);
  });

  it('returns HIGH confidence when all scores are identical', () => {
    const result = meanAggregator.apply([5, 5, 5], []);
    expect(result.confidence).toBe(AggregationConfidenceLevels.HIGH);
    expect(result.std).toBe(0);
  });

  it('returns LOW confidence when all scores are unique', () => {
    const result = meanAggregator.apply([1, 2, 3], []);
    expect(result.confidence).toBe(AggregationConfidenceLevels.LOW);
  });

  it('returns MEDIUM confidence when some scores repeat', () => {
    const result = meanAggregator.apply([1, 1, 2, 3], []);
    expect(result.confidence).toBe(AggregationConfidenceLevels.MEDIUM);
  });

  it('handles string scores with references', () => {
    const result = meanAggregator.apply(
      ['bad', 'ok', 'good'],
      numericReferences,
    );
    expect(result.value).toBe(1);
  });

  it('handles single score', () => {
    const result = meanAggregator.apply([42], []);
    expect(result.value).toBe(42);
    expect(result.std).toBe(0);
    expect(result.confidence).toBe(AggregationConfidenceLevels.HIGH);
  });
});

// --- medianAggregator ---

describe('medianAggregator', () => {
  it('has correct name and displayName', () => {
    expect(medianAggregator.name).toBe('median');
    expect(medianAggregator.displayName).toBe('Median');
  });

  it('finds median of odd-length numeric array', () => {
    const result = medianAggregator.apply([1, 3, 5], []);
    expect(result.value).toBe(3);
  });

  it('finds lower-middle for even-length array', () => {
    // Even-length: returns element at length/2 - 1 after sorting
    const result = medianAggregator.apply([1, 2, 3, 4], []);
    expect(result.value).toBe(2);
  });

  it('sorts before finding median', () => {
    const result = medianAggregator.apply([5, 1, 3], []);
    expect(result.value).toBe(3);
  });

  it('returns HIGH confidence when all scores are identical', () => {
    const result = medianAggregator.apply([5, 5, 5], []);
    expect(result.confidence).toBe(AggregationConfidenceLevels.HIGH);
  });

  it('returns string value when references map back to string', () => {
    const result = medianAggregator.apply(
      ['bad', 'ok', 'good'],
      numericReferences,
    );
    expect(result.value).toBe('ok');
  });

  it('calculates standard deviation around median', () => {
    const result = medianAggregator.apply([7, 7, 7], []);
    expect(result.std).toBe(0);
  });
});

// --- majorityAggregator ---

describe('majorityAggregator', () => {
  it('has correct name and displayName', () => {
    expect(majorityAggregator.name).toBe('majority');
    expect(majorityAggregator.displayName).toBe('Majority');
  });

  it('returns the unanimous value with HIGH confidence', () => {
    const result = majorityAggregator.apply(
      ['good', 'good', 'good'],
      numericReferences,
    );
    expect(result.value).toBe('good');
    expect(result.confidence).toBe(AggregationConfidenceLevels.HIGH);
  });

  it('returns Indeterminate with LOW confidence when all values are unique and > 1', () => {
    const result = majorityAggregator.apply(
      ['bad', 'ok', 'good'],
      numericReferences,
    );
    expect(result.value).toBe('Indeterminate');
    expect(result.confidence).toBe(AggregationConfidenceLevels.LOW);
  });

  it('returns most common value with MEDIUM confidence for close neighbors', () => {
    // Two unique values, adjacent: most common wins with MEDIUM
    const result = majorityAggregator.apply(
      ['good', 'good', 'great'],
      numericReferences,
    );
    expect(result.value).toBe('good');
    expect(result.confidence).toBe(AggregationConfidenceLevels.MEDIUM);
  });

  it('handles numeric scores', () => {
    const result = majorityAggregator.apply([5, 5, 5], []);
    expect(result.value).toBe('5');
    expect(result.confidence).toBe(AggregationConfidenceLevels.HIGH);
  });
});

// --- unionAggregator ---

describe('unionAggregator', () => {
  it('has correct name and displayName', () => {
    expect(unionAggregator.name).toBe('union');
    expect(unionAggregator.displayName).toBe('Union');
  });

  it('returns union of arrays', () => {
    const result = unionAggregator.apply([
      [1, 2, 3],
      [3, 4, 5],
    ]);
    expect(result).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
    expect(result).toHaveLength(5);
  });

  it('handles string arrays', () => {
    const result = unionAggregator.apply([
      ['a', 'b'],
      ['b', 'c'],
    ]);
    expect(result).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(result).toHaveLength(3);
  });

  it('handles empty arrays', () => {
    const result = unionAggregator.apply([[], [1, 2]]);
    expect(result).toEqual([1, 2]);
  });

  it('handles all empty arrays', () => {
    const result = unionAggregator.apply([[], []]);
    expect(result).toEqual([]);
  });

  it('handles identical arrays', () => {
    const result = unionAggregator.apply([
      [1, 2],
      [1, 2],
    ]);
    expect(result).toEqual([1, 2]);
  });
});

// --- intersectionAggregator ---

describe('intersectionAggregator', () => {
  it('has correct name and displayName', () => {
    expect(intersectionAggregator.name).toBe('intersection');
    expect(intersectionAggregator.displayName).toBe('Intersection');
  });

  it('returns intersection of arrays', () => {
    const result = intersectionAggregator.apply([
      [1, 2, 3],
      [2, 3, 4],
    ]);
    expect(result).toEqual(expect.arrayContaining([2, 3]));
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no common elements', () => {
    const result = intersectionAggregator.apply([
      [1, 2],
      [3, 4],
    ]);
    expect(result).toEqual([]);
  });

  it('handles identical arrays', () => {
    const result = intersectionAggregator.apply([
      [1, 2, 3],
      [1, 2, 3],
    ]);
    expect(result).toEqual([1, 2, 3]);
  });

  it('handles three arrays', () => {
    const result = intersectionAggregator.apply([
      [1, 2, 3],
      [2, 3, 4],
      [3, 4, 5],
    ]);
    expect(result).toEqual([3]);
  });
});

// --- majorityUnionAggregator ---

describe('majorityUnionAggregator', () => {
  it('has correct name and displayName', () => {
    expect(majorityUnionAggregator.name).toBe('majority');
    expect(majorityUnionAggregator.displayName).toBe('Majority');
  });

  it('returns items present in contiguous majority of annotators', () => {
    // 3 annotators: majority = ceil(3/2) = 2
    // The algorithm uses sliding windows of contiguous annotator indices
    // Combinations: [0,1,2], [0,1], [1,2]
    // intersection([0,1,2]) = intersection(['a','b','d'], ['b','c','d'], ['a','b']) = ['b']
    // intersection([0,1]) = intersection(['a','b','d'], ['b','c','d']) = ['b','d']
    // intersection([1,2]) = intersection(['b','c','d'], ['a','b']) = ['b']
    // union of all = ['b', 'd']
    const result = majorityUnionAggregator.apply([
      ['a', 'b', 'd'],
      ['b', 'c', 'd'],
      ['a', 'b'],
    ]);
    expect(result).toEqual(expect.arrayContaining(['b', 'd']));
    expect(result).not.toContain('c');
  });

  it('returns all items when all annotators agree', () => {
    const result = majorityUnionAggregator.apply([
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
    ]);
    expect(result).toEqual(expect.arrayContaining([1, 2, 3]));
  });

  it('returns empty when no items have majority', () => {
    // 3 annotators, each with completely different items
    const result = majorityUnionAggregator.apply([[1], [2], [3]]);
    expect(result).toEqual([]);
  });

  it('handles two annotators (majority = both)', () => {
    // 2 annotators: majority = ceil(2/2) = 1, so union of all intersections of size >= 1
    // This includes individual annotator lists, so it's effectively a union
    const result = majorityUnionAggregator.apply([
      [1, 2],
      [2, 3],
    ]);
    expect(result).toEqual(expect.arrayContaining([1, 2, 3]));
  });

  it('handles single annotator', () => {
    const result = majorityUnionAggregator.apply([[1, 2, 3]]);
    expect(result).toEqual(expect.arrayContaining([1, 2, 3]));
  });
});
