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

import { Statistics } from 'statistics.js';

export function spearman(pairs: any[]): number {
  // NaN means undetermined aggregate score
  const filteredPairs = pairs.filter(
    (p) => !isNaN(p.valueA) && !isNaN(p.valueB),
  );

  // Fisher transformation (3rd arg = true) requires rho in [-1, 1], which is
  // undefined when either column has zero variance. Guard here to avoid the
  // statistics.js error rather than catching it after the fact.
  if (filteredPairs.length < 2) return NaN;
  const allSameA = filteredPairs.every(
    (p) => p.valueA === filteredPairs[0].valueA,
  );
  const allSameB = filteredPairs.every(
    (p) => p.valueB === filteredPairs[0].valueB,
  );
  if (allSameA || allSameB) return NaN;

  const stats = new Statistics(filteredPairs, {
    valueA: 'metric',
    valueB: 'metric',
  });
  // statistics.js always computes Fisher + beta-function significance regardless
  // of arguments, and throws on edge-case rho values (e.g. exactly ±1, tiny n).
  // Wrap in try/catch so a degenerate pair doesn't break the whole heatmap.
  try {
    const dependence = stats.spearmansRho('valueA', 'valueB');
    return dependence ? dependence.rho : NaN;
  } catch {
    return NaN;
  }
}
