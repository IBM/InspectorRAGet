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

import { countBy, intersection, union, range } from 'lodash';

import {
  Aggregator,
  AggregationConfidenceLevels,
  AggregationStatistics,
  MetricValue,
} from '@/src/types';
import { castToNumber } from '@/src/utilities/metrics';

export const averageAggregator: Aggregator = {
  name: 'averagae',
  displayName: 'Average',
  apply: (
    scores: number[] | string[],
    references: MetricValue[],
  ): AggregationStatistics => {
    // Step 1: Cast score to numbers
    const numericScores = scores.map((score) =>
      typeof score === 'string' ? castToNumber(score, references) : score,
    );

    // Step 2: Calculate aggregate value & standard deviation
    const mean = numericScores.reduce((a, b) => a + b) / numericScores.length;
    const std = Math.sqrt(
      numericScores
        .map((score) => Math.pow(score - mean, 2))
        .reduce((a, b) => a + b) / numericScores.length,
    );

    // Step 3: Calculate confidence level
    const sorted_counter = Object.entries(countBy(scores));
    const numberOfUniqueValues = sorted_counter.length;
    const mostCommonValueCount = sorted_counter[0][1];

    return {
      value: Math.round((mean + Number.EPSILON) * 100) / 100,
      std: Math.round((std + Number.EPSILON) * 100) / 100,
      confidence:
        mostCommonValueCount === scores.length
          ? AggregationConfidenceLevels.HIGH
          : numberOfUniqueValues === scores.length
            ? AggregationConfidenceLevels.LOW
            : AggregationConfidenceLevels.MEDIUM,
    };
  },
};

export const majorityAggregator: Aggregator = {
  name: 'majority',
  displayName: 'Majority',
  apply: (
    scores: number[] | string[],
    references: MetricValue[],
  ): AggregationStatistics => {
    // Step 0: Create counter
    const counter: { [key: string]: number } = countBy(scores);
    // Step 1: Sort counter values
    const sorted_counter = Object.entries(counter);
    sorted_counter.sort((x, y) => {
      return y[1] - x[1];
    });

    // Step 2: Number of unique values, most common value and its count
    const numberOfAnnotators = scores.length;
    const numberOfUniqueValues = sorted_counter.length;
    const mostCommonValue = sorted_counter[0][0];
    const mostCommonValueCount = sorted_counter[0][1];

    // Step 3: Initialize defaults for aggregate value, standard deviation and confidence level
    let value = 'Indeterminate';
    let confidence = AggregationConfidenceLevels.LOW;

    // Step 3.a: Cast score to numbers
    const numericScores = scores.map((score) =>
      typeof score === 'string' ? castToNumber(score, references) : score,
    );
    // Step 2: Calculate aggregate value & standard deviation
    const mean = numericScores.reduce((a, b) => a + b) / numericScores.length;
    const std = Math.sqrt(
      numericScores
        .map((score) => Math.pow(score - mean, 2))
        .reduce((a, b) => a + b) / numericScores.length,
    );

    // Step 3: Calculate aggregate value, standard deviation and confidence level
    if (mostCommonValueCount === numberOfAnnotators) {
      value = mostCommonValue;
      confidence = AggregationConfidenceLevels.HIGH;
    } else if (
      numberOfUniqueValues === numberOfAnnotators &&
      numberOfUniqueValues > 1
    ) {
      value = 'Indeterminate';
      confidence = AggregationConfidenceLevels.LOW;
    } else if (
      numberOfUniqueValues > Math.ceil(numberOfAnnotators / 2) ||
      (mostCommonValueCount < Math.ceil(numberOfAnnotators / 2) &&
        numberOfUniqueValues === Math.ceil(numberOfAnnotators / 2) &&
        Math.abs(
          castToNumber(mostCommonValue, references) -
            castToNumber(sorted_counter[1][0], references),
        ) > 1)
    ) {
      value = 'Indeterminate';
      confidence = AggregationConfidenceLevels.LOW;
    } else if (
      numberOfUniqueValues == 2 &&
      Math.abs(
        castToNumber(mostCommonValue, references) -
          castToNumber(sorted_counter[1][0], references),
      ) < 2
    ) {
      value = mostCommonValue;
      confidence = AggregationConfidenceLevels.MEDIUM;
    } else {
      value = mostCommonValue;
      confidence = AggregationConfidenceLevels.LOW;
    }

    return {
      value: value,
      std: Math.round((std + Number.EPSILON) * 100) / 100,
      confidence: confidence,
    };
  },
};

/**
 * Returns unions of all scores
 * NOTE: Applies only to array of numbers or strings
 */
export const unionAggregator: Aggregator = {
  name: 'union',
  displayName: 'Union',
  apply: (scores: number[][] | string[][]): (number | string)[] => {
    return union(...scores);
  },
};

/**
 * Returns intersection of all scores
 * NOTE: Applies only to array of numbers or strings
 */
export const intersectionAggregator: Aggregator = {
  name: 'intersection',
  displayName: 'Intersection',
  apply: (scores: number[][] | string[][]): (number | string)[] => {
    return intersection(...scores);
  },
};

/**
 * Returns majority  of all scores
 * NOTE: Applies only to array of numbers or strings
 */
export const majorityUnionAggregator: Aggregator = {
  name: 'majority',
  displayName: 'Majority',
  apply: (scores: number[][] | string[][]): (number | string)[] => {
    // Step 1: Determine number of annotators
    const numberOfAnnotators = scores.length;
    const annotatorIds = range(numberOfAnnotators);

    // Step 2: Create combination of annotators
    const annotatorIdCombinations: number[][] = [];
    for (
      let size = numberOfAnnotators;
      size >= Math.ceil(numberOfAnnotators / 2);
      size--
    ) {
      for (
        let startIdx = 0;
        startIdx + size <= numberOfAnnotators;
        startIdx++
      ) {
        annotatorIdCombinations.push(
          annotatorIds.slice(startIdx, startIdx + size),
        );
      }
    }

    // Step 3: Combine relevant contexts chosen by at least majority of annotators
    return union(
      ...annotatorIdCombinations.map((annotatorIdCombination) => {
        return intersection(
          ...annotatorIdCombination.map((annotatorId) => scores[annotatorId]),
        );
      }),
    );
  },
};
