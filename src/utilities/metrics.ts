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

import { countBy, isNumber } from 'lodash';
import { Metric, MetricValue } from '@/src/types';

export const MetricDefinitions = {
  coherence: 'The response is coherent, natural, and not dismissive.',
  naturalness: 'The response is coherent, natural, and not dismissive.',
  specificity:
    'The response provides appropriate amount of useful information.',
  appropriateness:
    'The response provides appropriate amount of useful information.',
  faithfulness: 'The response is faithful and grounded on the context.',
  feedback:
    "Annotator's comments about quality of response, potential issues etc.",
};

export const AgreementLevels = {
  ABSOLUTE_AGREEMENT: 3,
  HIGH_AGREEMENT: 2,
  LOW_AGREEMENT: 1,
  NO_AGREEMENT: 0,
};

export const AgreementLevelDefinitions = {
  Absolute: 'All annotators selected a same value for a given metric.',
  High: 'Majority of annotators selected a same value for a given metric and the most common value and the 2nd most common value were less that 2 units apart.',
  Low: 'Majority of annotators selected a same value for a given metric.',
  No: 'Majority of annotators selected different values for a given metric.',
};

export function extractMetricDisplayValue(
  value: string | number,
  references?: MetricValue[],
): string {
  // If value is of type "string"
  if (typeof value === 'string') {
    if (references) {
      const reference = references.find((entry) => entry.value === value);

      if (reference && reference.displayValue) {
        return reference.displayValue;
      } else {
        return value;
      }
    } else {
      return value;
    }
  } else {
    // Value is of type "number"
    return parseFloat(value.toFixed(2)).toString();
  }
}

export function extractMetricDisplayName(metric: Metric): string {
  return metric.displayName
    ? metric.displayName
    : metric.name.charAt(0).toUpperCase() + metric.name.slice(1).toLowerCase();
}

/**
 * Converts numeric value to metric value using references in case of 'categorical' metrics
 * @param value numeric value to convert
 * @param references reference metric values
 * @returns metric value
 */
export function castToValue(
  value: number,
  references?: MetricValue[],
): string | number {
  if (references) {
    const reference = references.find((entry) => entry.numericValue === value);

    if (reference && reference.value) {
      return reference.value;
    } else {
      return value;
    }
  }

  // Default return
  return value;
}

export function castToNumber(
  value: string | number,
  references?: MetricValue[],
  key?: 'value' | 'displayValue',
): number {
  // If value is of type "string"
  if (typeof value === 'string') {
    if (references) {
      const reference = references.find((entry) =>
        key ? entry[key] === value : entry.value === value,
      );

      if (
        reference &&
        reference.hasOwnProperty('numericValue') &&
        typeof reference.numericValue === 'number'
      ) {
        return reference.numericValue;
      } else {
        return parseFloat(value);
      }
    }
    // Fall back to parsing when no references are available
    else if (value === 'N/A' || value === '') {
      return 0;
    } else {
      return parseFloat(value);
    }
  }
  // Value is of type "number"
  else {
    return value;
  }
}

/**
 * Compute mean value
 * @param metric metric under consideration
 * @param scores distribution of values
 * @returns
 */
function computeMean(
  metric: Metric,
  scores: string[] | number[],
): { level: number; value: number | string } {
  const counter: { [key: string]: number } = countBy(scores);
  const sorted_counter = Object.entries(counter);
  sorted_counter.sort((x, y) => {
    return y[1] - x[1];
  });

  const numberOfUniqueValues = sorted_counter.length;
  const mostCommonValueCount = sorted_counter[0][1];

  let sum: number = 0;
  for (const [value, count] of Object.entries(counter)) {
    sum +=
      (typeof value === 'string' ? castToNumber(value, metric.values) : value) *
      count;
  }
  const mean = Math.round((sum / scores.length + Number.EPSILON) * 100) / 100;

  // Absolute agreement
  if (mostCommonValueCount === scores.length)
    return {
      level: AgreementLevels.ABSOLUTE_AGREEMENT,
      value: mean,
    };

  // No agreement: every annotator chose a different value
  if (numberOfUniqueValues === scores.length)
    return {
      level: AgreementLevels.NO_AGREEMENT,
      value: mean,
    };

  return {
    level: AgreementLevels.HIGH_AGREEMENT,
    value: mean,
  };
}

/**
 * Compute median value
 * @param metric metric under consideration
 * @param counter distribution of values
 * @returns
 */
function computeMedian(
  metric: Metric,
  scores: string[] | number[],
): { level: number; value: number | string } {
  const counter: { [key: string]: number } = countBy(scores);
  const sorted_counter = Object.entries(counter);
  sorted_counter.sort((x, y) => {
    return y[1] - x[1];
  });

  const numberOfUniqueValues = sorted_counter.length;
  const mostCommonValueCount = sorted_counter[0][1];

  const numericScores = scores.map((score) =>
    typeof score === 'string' ? castToNumber(score, metric.values) : score,
  );

  const sortedNumericScores = numericScores.toSorted((a, b) => a - b);

  const median =
    sortedNumericScores.length % 2 == 0
      ? sortedNumericScores[sortedNumericScores.length / 2 - 1]
      : sortedNumericScores[(sortedNumericScores.length + 1) / 2 - 1];

  // Absolute agreement
  if (mostCommonValueCount === scores.length)
    return {
      level: AgreementLevels.ABSOLUTE_AGREEMENT,
      value: castToValue(median, metric.values),
    };

  // No agreement: every annotator chose a different value
  if (numberOfUniqueValues === scores.length)
    return {
      level: AgreementLevels.NO_AGREEMENT,
      value: castToValue(median, metric.values),
    };

  return {
    level: AgreementLevels.HIGH_AGREEMENT,
    value: castToValue(median, metric.values),
  };
}

/**
 * Compute majority value
 * @param metric metric under consideration
 * @param counter distribution of values
 * @param numberOfAnnotators number of annotators
 * @returns
 */
function computeMajority(
  metric: Metric,
  counter: { [key: string]: number },
  numberOfAnnotators: number,
): { level: number; value: number | string } {
  const sorted_counter = Object.entries(counter);
  sorted_counter.sort((x, y) => {
    return y[1] - x[1];
  });

  const numberOfUniqueValues = sorted_counter.length;
  const mostCommonValue = sorted_counter[0][0];
  const mostCommonValueCount = sorted_counter[0][1];

  // Absolute agreement
  if (mostCommonValueCount === numberOfAnnotators)
    return {
      level: AgreementLevels.ABSOLUTE_AGREEMENT,
      value: mostCommonValue,
    };

  // No agreement: every annotator chose a different value
  if (numberOfUniqueValues === numberOfAnnotators)
    return {
      level: AgreementLevels.NO_AGREEMENT,
      value: 'Indeterminate',
    };

  // No agreement: more than half selected different values, or top-2 values are far apart
  if (
    numberOfUniqueValues > Math.ceil(numberOfAnnotators / 2) ||
    (mostCommonValueCount < Math.ceil(numberOfAnnotators / 2) &&
      numberOfUniqueValues === Math.ceil(numberOfAnnotators / 2) &&
      Math.abs(
        castToNumber(mostCommonValue, metric.values) -
          castToNumber(sorted_counter[1][0], metric.values),
      ) > 1)
  ) {
    return {
      level: AgreementLevels.NO_AGREEMENT,
      value: 'Indeterminate',
    };
  }

  // High agreement: only two unique values that are close together
  if (
    numberOfUniqueValues == 2 &&
    Math.abs(
      castToNumber(mostCommonValue, metric.values) -
        castToNumber(sorted_counter[1][0], metric.values),
    ) < 2
  ) {
    return {
      level: AgreementLevels.HIGH_AGREEMENT,
      value: mostCommonValue,
    };
  }

  return {
    level: AgreementLevels.LOW_AGREEMENT,
    value: mostCommonValue,
  };
}

export function calculateAggregateValue(
  metric: Metric,
  entries: { [key: string]: any },
) {
  if (metric.author === 'algorithm') {
    if (metric.aggregator) {
      let scores: string[] | number[] = Object.values(entries).map(
        (entry) => entry.value,
      );
      if (metric.aggregator === 'average' || metric.aggregator === 'mean') {
        return computeMean(metric, scores);
      } else if (metric.aggregator === 'median') {
        return computeMedian(metric, scores);
      } else {
        return computeMajority(metric, countBy(scores), scores.length);
      }
    } else {
      return {
        level: AgreementLevels.NO_AGREEMENT,
        value: undefined,
      };
    }
  } else {
    if (metric.aggregator) {
      let scores: string[] | number[] = Object.values(entries).map(
        (entry) => entry.value,
      );
      if (metric.aggregator === 'average' || metric.aggregator === 'mean') {
        return computeMean(metric, scores);
      } else if (metric.aggregator === 'median') {
        return computeMedian(metric, scores);
      } else {
        return computeMajority(metric, countBy(scores), scores.length);
      }
    } else {
      return {
        level: AgreementLevels.NO_AGREEMENT,
        value: undefined,
      };
    }
  }
}

export function mergeAgreementObjects({
  source,
  target,
}: {
  source: object;
  target: object;
}) {
  if (source) {
    Object.entries(source).forEach(([group, entry]) => {
      for (const [key, value] of Object.entries(entry)) {
        if (target.hasOwnProperty(group)) {
          if (target[group].hasOwnProperty(key)) {
            target[group][key] += value;
          } else {
            target[group][key] = value;
          }
        } else {
          target[group] = { [key]: value };
        }
      }
    });
  }
}

export function bin(value: number | string, metric: Metric, n?: number) {
  if (typeof value === 'number' && metric.type === 'numerical') {
    if (metric.range && metric.range.length == 3) {
      for (
        let idx: number = 0;
        metric.range[0] + idx * metric.range[2] + metric.range[2] <=
        metric.range[1];
        idx++
      ) {
        const start: number = parseFloat(
          (metric.range[0] + idx * metric.range[2]).toFixed(2),
        );
        const end: number = parseFloat(
          (metric.range[0] + idx * metric.range[2] + metric.range[2]).toFixed(
            2,
          ),
        );
        if (start <= value && value <= end) {
          return `${start}-${end}`;
        }
      }
    }
  }

  return value;
}

export function compareMetricAggregatedValues(
  a: { key: string | number; value: number },
  b: { key: string | number; value: number },
  metric: Metric,
): number {
  if (metric.aggregator && metric.aggregator === 'average') {
    if (typeof a.key === 'number' && typeof b.key === 'number') {
      return a.key - b.key;
    } else if (typeof a.key === 'string' && typeof b.key === 'string') {
      return parseFloat(a.key) - parseFloat(b.key);
    } else {
      return 0;
    }
  } else if (metric.aggregator && metric.aggregator === 'majority') {
    if (typeof a.key === 'string' && typeof b.key === 'string') {
      if (a.key === 'Indeterminate' || b.key === 'Indeterminate') {
        if (b.key === 'Indeterminate' && a.key != 'Indeterminate') {
          return 1;
        } else if (a.key === 'Indeterminate' && b.key != 'Indeterminate') {
          return -1;
        }
        return 0;
      }
      const aValue = metric.values?.find((entry) => entry.value == a.key);
      const bValue = metric.values?.find((entry) => entry.value == b.key);
      if (aValue && bValue) {
        // Do direct value comparison in numerical values exists
        if (
          (aValue.numericValue != undefined || aValue.numericValue != null) &&
          isNumber(aValue.numericValue) &&
          (bValue.numericValue != undefined || bValue.numericValue != null) &&
          isNumber(bValue.numericValue)
        ) {
          return aValue.numericValue - bValue.numericValue;
        }
        // For numerical values, do direct value comparison
        else if (typeof a.value === 'number' && typeof b.value === 'number') {
          return a.value - b.value;
        } else {
          return a.key.localeCompare(b.key);
        }
      }

      // Do string comparison with non-ASCII support
      return a.key.localeCompare(b.key);
    }

    // Default: Preserve same order
    return 0;
  }

  return a.key > b.key ? 1 : -1;
}
