/**
 *
 * Copyright 2023-2025 InspectorRAGet Team
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
  //NaN means undetermined aggregate score
  const filteredPairs = pairs.filter(
    (p) => !isNaN(p.valueA) && !isNaN(p.valueB),
  );

  var stats = new Statistics(filteredPairs, {
    valueA: 'metric',
    valueB: 'metric',
  });
  var dependence = stats.spearmansRho('valueA', 'valueB', true);
  return dependence ? dependence.rho : NaN;
}
