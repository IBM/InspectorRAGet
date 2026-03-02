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
import { calculateFisherRandomization } from '@/src/utilities/significance';

describe('calculateFisherRandomization', () => {
  it('returns array of [pValue, meanA, meanB]', () => {
    const result = calculateFisherRandomization([1, 2, 3], [4, 5, 6], 1000);
    expect(result).toHaveLength(3);
  });

  it('returns correct means', () => {
    const [, meanA, meanB] = calculateFisherRandomization(
      [2, 4, 6],
      [1, 3, 5],
      100,
    );
    expect(meanA).toBe(4);
    expect(meanB).toBe(3);
  });

  it('returns p-value close to 1 for identical distributions', () => {
    const [pValue] = calculateFisherRandomization(
      [5, 5, 5, 5, 5],
      [5, 5, 5, 5, 5],
      10000,
    );
    // Identical distributions → actual difference is 0 → all trials >= 0
    expect(pValue).toBeCloseTo(1, 1);
  });

  it('returns small p-value for very different distributions', () => {
    const distA = Array(50).fill(100);
    const distB = Array(50).fill(0);
    const [pValue] = calculateFisherRandomization(distA, distB, 10000);
    expect(pValue).toBeLessThan(0.01);
  });

  it('returns p-value between 0 and 1', () => {
    const [pValue] = calculateFisherRandomization(
      [1, 2, 3, 4, 5],
      [2, 3, 4, 5, 6],
      1000,
    );
    expect(pValue).toBeGreaterThan(0);
    expect(pValue).toBeLessThanOrEqual(1);
  });
});
