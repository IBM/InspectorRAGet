/**
 *
 * Copyright 2023-2024 InspectorRAGet Team
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

/**
 * Fisher's Randomization Test as described in "A Comparison of Statistical Significance Tests for Information Retrieval Evaluation" by Mark D. Smucker, James Allan, and Ben Carterette. CIKM 2007.
 *
 * The same method is described in W. Morgan’s slides ( https://cs.stanford.edu/people/wmorgan/sigtest.pdf ) under the name "randomization test".
 * W. Morgan adds “+1” that Morgan adds to the numerator and denominator (the bullet starting with “Actually” on slide 10 and ending with “not that it matters for, say, R ≥ 19”).
 * We do the same here because Morgan’s case for including it (to be "statistically valid") seems solid -- but as noted, it doesn't matter much.
 *
 * Philipp Koehn ( https://aclanthology.org/W04-3250/ ) calls the method "paired bootstrap resampling".
 *
 * NOTE: This implementation assumes the metric is computed as the mean of a list of scores, one per sample.
 *
 * EXTRA: Fisher's Randomization Test can also be run on other metrics, but then you need to apply the full metric computation to the x and y vectors below.
 * @param distributionA
 * @param distributionB
 * @param FISHER_RANDOMIZATION_TRIALS
 * @returns
 */
export function calculateFisherRandomization(
  distributionA: number[],
  distributionB: number[],
  FISHER_RANDOMIZATION_TRIALS: number = 100000,
) {
  const meanA = distributionA.reduce((a, b) => a + b) / distributionA.length;
  const meanB = distributionB.reduce((a, b) => a + b) / distributionB.length;
  const actualDifference = Math.abs(meanA - meanB);

  const length = distributionA.length;
  let trialDifferencesGreaterOrEqualToActualCount = 0;
  for (let trialIdx = 0; trialIdx < FISHER_RANDOMIZATION_TRIALS; trialIdx++) {
    let sumX = 0;
    let sumY = 0;

    for (let i = 0; i < length; i++) {
      if (Math.random() < 0.5) {
        sumX += distributionA[i];
        sumY += distributionB[i];
      } else {
        sumX += distributionB[i];
        sumY += distributionA[i];
      }
    }

    trialDifferencesGreaterOrEqualToActualCount +=
      Math.abs(sumX / length - sumY / length) >= actualDifference ? 1 : 0;
  }

  return [
    (trialDifferencesGreaterOrEqualToActualCount + 1) /
      (FISHER_RANDOMIZATION_TRIALS + 1),
    meanA,
    meanB,
  ];
}
