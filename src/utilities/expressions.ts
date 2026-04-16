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

import { isEmpty, intersectionWith, unionWith, isEqual } from 'lodash';
import { Metric, ModelResult } from '@/src/types';
import { castToNumber } from '@/src/utilities/metrics';

// ===================================================================================
//                                CONSTANTS
// ===================================================================================
export const PLACEHOLDER_EXPRESSION_TEXT = '{}';
export enum EXPRESSION_OPERATORS {
  // Logical operators
  AND = '$and',
  OR = '$or',

  // Comparison operators
  EQ = '$eq',
  NEQ = '$neq',
  GT = '$gt',
  GTE = '$gte',
  LT = '$lt',
  LTE = '$lte',

  // Set membership operators
  IN = '$in',
  NIN = '$nin',
}

export function validate(
  expression: object,
  modelIds?: string[],
  values?: (string | number)[],
  parent?: string,
): string | null {
  const keys = Object.keys(expression);

  // Reject empty expression at the top level only (parent is undefined for
  // the root call). Nested empty objects are already caught by the logical
  // operator check below.
  if (keys.length === 0 && parent === undefined) {
    return 'Expression cannot be empty';
  }

  const operators = keys.filter((key) => key.startsWith('$'));
  if (operators.length > 1) {
    return `More than one operator [${operators.join(', ')}] on the same level in the expression`;
  }

  if (operators.length === 1 && keys.length > 1) {
    return `Additional keys on the same level in the expression`;
  }

  if (operators.length === 1) {
    const operator = operators[0];

    // Logical operator condition
    if (
      operator === EXPRESSION_OPERATORS.AND ||
      operator === EXPRESSION_OPERATORS.OR
    ) {
      if (parent && modelIds && modelIds.includes(parent)) {
        return `Logical operator ("${operator}") must not preceed with model ID`;
      }

      if (
        !Array.isArray(expression[operator]) ||
        expression[operator].some((value) => typeof value !== 'object')
      ) {
        return `Logical operator ("${operator}") must follow with array of expressions`;
      }

      if (
        isEmpty(expression[operator]) ||
        expression[operator].some((entry) => isEmpty(entry))
      ) {
        return `Logical operator ("${operator}") cannot have empty expression value`;
      }

      for (let index = 0; index < expression[operator].length; index++) {
        const nestedErrorMessage = validate(
          expression[operator][index],
          modelIds,
        );
        if (nestedErrorMessage) {
          return nestedErrorMessage;
        }
      }
    }
    // Comparison operators condition
    else if (
      operator === EXPRESSION_OPERATORS.EQ ||
      operator === EXPRESSION_OPERATORS.NEQ ||
      operator === EXPRESSION_OPERATORS.LT ||
      operator === EXPRESSION_OPERATORS.LTE ||
      operator === EXPRESSION_OPERATORS.GT ||
      operator === EXPRESSION_OPERATORS.GTE
    ) {
      if (parent === undefined || parent.startsWith('$')) {
        return `Comparison operator ("${operator}") must preceed with model ID`;
      }
      if (
        typeof expression[operator] !== 'string' &&
        typeof expression[operator] !== 'number'
      ) {
        return `Comparison operator ("${operator}") must follow primitive data types ("string" or "number")`;
      }
    }
    // Set membership operators condition
    else if (
      operator === EXPRESSION_OPERATORS.IN ||
      operator === EXPRESSION_OPERATORS.NIN
    ) {
      if (parent === undefined || parent.startsWith('$')) {
        return `Set operator ("${operator}") must preceed with model ID`;
      }
      if (
        !Array.isArray(expression[operator]) ||
        expression[operator].some(
          (v) => typeof v !== 'string' && typeof v !== 'number',
        )
      ) {
        return `Set operator ("${operator}") must follow with an array of primitive values ("string" or "number")`;
      }
      if (expression[operator].length === 0) {
        return `Set operator ("${operator}") cannot have an empty array`;
      }
    }
  } else {
    for (let idx = 0; idx < keys.length; idx++) {
      if (modelIds && !modelIds.includes(keys[idx])) {
        return `Model ("${keys[idx]}") does not exists. Please use one for the following models: ${modelIds.join(', ')}`;
      }

      const value = expression[keys[idx]];
      if (
        typeof value !== 'object' &&
        typeof value !== 'string' &&
        typeof value !== 'number'
      ) {
        return `Model ("${keys[idx]}") must follow either expression or primitive data types ("string" or "number")`;
      }

      if (typeof value === 'object') {
        const nestedErrorMessage = validate(
          expression[keys[idx]],
          modelIds,
          values,
          keys[idx],
        );
        if (nestedErrorMessage) {
          return nestedErrorMessage;
        }
      } else {
        if (values && !values.includes(value)) {
          return `"${value}" is not a valid value option. Please use one of the following: ${values.join(', ')}`;
        }
      }
    }
  }

  return null;
}

export function evaluate(
  resultsPerTaskPerModel: {
    [key: string]: { [key: string]: ModelResult };
  },
  expression: object,
  metric: Metric,
  annotator?: string,
): ModelResult[] {
  const eligibleResults: ModelResult[] = [];
  const keys = Object.keys(expression);

  const operators = keys.filter((key) => key.startsWith('$'));
  if (operators.length === 1) {
    const operator = operators[0];

    if (
      operator === EXPRESSION_OPERATORS.AND ||
      operator === EXPRESSION_OPERATORS.OR
    ) {
      const results: ModelResult[][] = [];

      expression[operator].forEach((condition) => {
        results.push(
          evaluate(resultsPerTaskPerModel, condition, metric, annotator),
        );
      });

      if (operator === EXPRESSION_OPERATORS.AND) {
        return intersectionWith(...results, isEqual);
      } else {
        return unionWith(...results, isEqual);
      }
    }
  } else {
    // No logical operator: check each task's results against per-model conditions
    Object.values(resultsPerTaskPerModel).forEach((evaluationPerModel) => {
      let satisfy: boolean = true;

      for (let idx = 0; idx < keys.length; idx++) {
        if (!evaluationPerModel.hasOwnProperty(keys[idx])) {
          satisfy = false;
          break;
        }

        const evaluation = evaluationPerModel[keys[idx]];

        // Use annotator-specific value when available, otherwise aggregate
        let value: string | number;
        if (annotator) {
          if (!evaluation[metric.name].hasOwnProperty(annotator)) {
            satisfy = false;
            break;
          }
          value = castToNumber(
            evaluation[metric.name][annotator].value,
            metric.values,
          );
        } else {
          value = castToNumber(
            evaluation[`${metric.name}_agg`].value,
            metric.values,
          );
        }

        const expectation = expression[keys[idx]];

        if (typeof expectation === 'object') {
          // Extract comparison operator from expectation expression
          const operator = Object.keys(expectation).filter((key) =>
            key.startsWith('$'),
          )[0];

          // Unknown operator (e.g. typo like "GT" instead of "$gt") — fail the task
          // rather than silently passing it through.
          if (!operator) {
            satisfy = false;
            break;
          }

          const threshold = castToNumber(
            expectation[operator],
            metric.values,
            typeof expectation[operator] === 'string'
              ? 'displayValue'
              : 'value',
          );

          // If comparison operator is "$gt"
          if (
            operator === EXPRESSION_OPERATORS.GT &&
            (isNaN(value) || value <= threshold)
          ) {
            satisfy = false;
            break;
          }

          // If comparison operator is "$gte"
          if (
            operator === EXPRESSION_OPERATORS.GTE &&
            (isNaN(value) || value < threshold)
          ) {
            satisfy = false;
            break;
          }

          // If comparison operator is "$lt"
          if (
            operator === EXPRESSION_OPERATORS.LT &&
            (isNaN(value) || value >= threshold)
          ) {
            satisfy = false;
            break;
          }

          // If comparison operator is "$lte"
          if (
            operator === EXPRESSION_OPERATORS.LTE &&
            (isNaN(value) || value > threshold)
          ) {
            satisfy = false;
            break;
          }

          // If comparison operator is "$eq"
          if (
            operator === EXPRESSION_OPERATORS.EQ &&
            (isNaN(value) || value !== threshold)
          ) {
            satisfy = false;
            break;
          }

          // If comparison operator is "$neq"
          if (
            operator === EXPRESSION_OPERATORS.NEQ &&
            (isNaN(value) || value === threshold)
          ) {
            satisfy = false;
            break;
          }

          // If comparison operator is "$in"
          if (operator === EXPRESSION_OPERATORS.IN) {
            const numericSet = expectation[operator].map((v) =>
              castToNumber(v, metric.values),
            );
            if (isNaN(value) || !numericSet.includes(value)) {
              satisfy = false;
              break;
            }
          }

          // If comparison operator is "$nin"
          if (operator === EXPRESSION_OPERATORS.NIN) {
            const numericSet = expectation[operator].map((v) =>
              castToNumber(v, metric.values),
            );
            if (isNaN(value) || numericSet.includes(value)) {
              satisfy = false;
              break;
            }
          }
        } else {
          // Primitive expectation: direct equality check
          if (
            isNaN(value) ||
            value !==
              castToNumber(
                expectation,
                metric.values,
                typeof expectation === 'string' ? 'displayValue' : 'value',
              )
          ) {
            satisfy = false;
            break;
          }
        }
      }

      if (satisfy) {
        eligibleResults.push(...Object.values(evaluationPerModel));
      }
    });
  }

  return eligibleResults;
}

// --- Label expressions ---

// Validates an expression for use with labels. Same structural rules as
// validate(), but rejects ordering operators ($gt, $gte, $lt, $lte) because
// labels are nominal — no ordering exists.
export function validateLabelExpression(
  expression: object,
  modelIds?: string[],
  parent?: string,
): string | null {
  const keys = Object.keys(expression);

  if (keys.length === 0 && parent === undefined) {
    return 'Expression cannot be empty';
  }

  const operators = keys.filter((key) => key.startsWith('$'));
  if (operators.length > 1) {
    return `More than one operator [${operators.join(', ')}] on the same level in the expression`;
  }

  if (operators.length === 1 && keys.length > 1) {
    return 'Additional keys on the same level in the expression';
  }

  if (operators.length === 1) {
    const operator = operators[0];

    if (
      operator === EXPRESSION_OPERATORS.AND ||
      operator === EXPRESSION_OPERATORS.OR
    ) {
      if (parent && modelIds && modelIds.includes(parent)) {
        return `Logical operator ("${operator}") must not preceed with model ID`;
      }
      if (
        !Array.isArray(expression[operator]) ||
        expression[operator].some((value) => typeof value !== 'object')
      ) {
        return `Logical operator ("${operator}") must follow with array of expressions`;
      }
      if (
        isEmpty(expression[operator]) ||
        expression[operator].some((entry) => isEmpty(entry))
      ) {
        return `Logical operator ("${operator}") cannot have empty expression value`;
      }
      for (let index = 0; index < expression[operator].length; index++) {
        const nestedError = validateLabelExpression(
          expression[operator][index],
          modelIds,
        );
        if (nestedError) return nestedError;
      }
    } else if (
      operator === EXPRESSION_OPERATORS.EQ ||
      operator === EXPRESSION_OPERATORS.NEQ
    ) {
      if (parent === undefined || parent.startsWith('$')) {
        return `Comparison operator ("${operator}") must preceed with model ID`;
      }
      if (
        typeof expression[operator] !== 'string' &&
        typeof expression[operator] !== 'number'
      ) {
        return `Comparison operator ("${operator}") must follow primitive data types ("string" or "number")`;
      }
    } else if (
      operator === EXPRESSION_OPERATORS.IN ||
      operator === EXPRESSION_OPERATORS.NIN
    ) {
      if (parent === undefined || parent.startsWith('$')) {
        return `Set operator ("${operator}") must preceed with model ID`;
      }
      if (
        !Array.isArray(expression[operator]) ||
        expression[operator].some(
          (v) => typeof v !== 'string' && typeof v !== 'number',
        )
      ) {
        return `Set operator ("${operator}") must follow with an array of primitive values ("string" or "number")`;
      }
      if (expression[operator].length === 0) {
        return `Set operator ("${operator}") cannot have an empty array`;
      }
    } else if (
      operator === EXPRESSION_OPERATORS.GT ||
      operator === EXPRESSION_OPERATORS.GTE ||
      operator === EXPRESSION_OPERATORS.LT ||
      operator === EXPRESSION_OPERATORS.LTE
    ) {
      return `Ordering operator ("${operator}") is not valid for labels — labels have no ordering`;
    } else {
      return `Unknown operator ("${operator}")`;
    }
  } else {
    for (let idx = 0; idx < keys.length; idx++) {
      if (modelIds && !modelIds.includes(keys[idx])) {
        return `Model ("${keys[idx]}") does not exist. Please use one of the following models: ${modelIds.join(', ')}`;
      }
      const value = expression[keys[idx]];
      if (
        typeof value !== 'object' &&
        typeof value !== 'string' &&
        typeof value !== 'number'
      ) {
        return `Model ("${keys[idx]}") must follow either expression or primitive data types ("string" or "number")`;
      }
      if (typeof value === 'object') {
        const nestedError = validateLabelExpression(
          expression[keys[idx]],
          modelIds,
          keys[idx],
        );
        if (nestedError) return nestedError;
      }
    }
  }

  return null;
}

// Evaluates a label expression against a labelsIndex slice.
//
// labelSlice: Map<taskId, Map<modelId, string>> — the labelsIndex entry for
// one label key. Values are raw producer strings or "N/A" for absent/null.
//
// Returns the set of taskIds whose per-model label values satisfy the expression.
// Supports $eq, $neq, $in, $nin, $and, $or. Ordering operators are not supported
// and should be rejected by validateLabelExpression before reaching here.
export function evaluateLabels(
  labelSlice: Map<string, Map<string, string>>,
  expression: object,
): Set<string> {
  const keys = Object.keys(expression);
  const operators = keys.filter((key) => key.startsWith('$'));

  if (operators.length === 1) {
    const operator = operators[0];

    if (
      operator === EXPRESSION_OPERATORS.AND ||
      operator === EXPRESSION_OPERATORS.OR
    ) {
      const subResults: Set<string>[] = expression[operator].map((condition) =>
        evaluateLabels(labelSlice, condition),
      );

      if (operator === EXPRESSION_OPERATORS.AND) {
        // Intersection: start from the first set, keep only items in all others
        return subResults.reduce((acc, set) => {
          const result = new Set<string>();
          for (const taskId of acc) {
            if (set.has(taskId)) result.add(taskId);
          }
          return result;
        });
      } else {
        // Union: merge all sets
        return subResults.reduce((acc, set) => {
          for (const taskId of set) acc.add(taskId);
          return acc;
        }, new Set<string>());
      }
    }
  }

  // No logical operator: evaluate per-model conditions against each task
  const matched = new Set<string>();

  for (const [taskId, modelValues] of labelSlice) {
    let satisfy = true;

    for (let idx = 0; idx < keys.length; idx++) {
      const modelId = keys[idx];
      // Value for this model on this task, defaulting to N/A if not present
      const value = modelValues.get(modelId) ?? 'N/A';
      const expectation = expression[modelId];

      if (typeof expectation === 'object') {
        const operator = Object.keys(expectation).find((k) =>
          k.startsWith('$'),
        );
        if (!operator) {
          satisfy = false;
          break;
        }

        if (
          operator === EXPRESSION_OPERATORS.EQ &&
          value !== expectation[operator]
        ) {
          satisfy = false;
          break;
        }
        if (
          operator === EXPRESSION_OPERATORS.NEQ &&
          value === expectation[operator]
        ) {
          satisfy = false;
          break;
        }
        if (
          operator === EXPRESSION_OPERATORS.IN &&
          !expectation[operator].includes(value)
        ) {
          satisfy = false;
          break;
        }
        if (
          operator === EXPRESSION_OPERATORS.NIN &&
          expectation[operator].includes(value)
        ) {
          satisfy = false;
          break;
        }
      } else {
        // Primitive shorthand: { "model-a": "value_x" } means $eq
        if (value !== String(expectation)) {
          satisfy = false;
          break;
        }
      }
    }

    if (satisfy) matched.add(taskId);
  }

  return matched;
}
