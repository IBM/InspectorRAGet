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
import { Metric, TaskEvaluation } from '@/src/types';
import { castToNumber } from '@/src/utilities/metrics';

// ===================================================================================
//                                CONSTANTS
// ===================================================================================
export const PLACHOLDER_EXPRESSION_TEXT = '{}';
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
}

export function validate(
  expression: object,
  modelIds?: string[],
  values?: (string | number)[],
  parent?: string,
): string | null {
  const keys = Object.keys(expression);

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
  evaluationsPerTaskPerModel: {
    [key: string]: { [key: string]: TaskEvaluation };
  },
  expression: object,
  metric: Metric,
  annotator?: string,
): TaskEvaluation[] {
  const eligibleEvaluations: TaskEvaluation[] = [];
  const keys = Object.keys(expression);

  const operators = keys.filter((key) => key.startsWith('$'));
  if (operators.length === 1) {
    const operator = operators[0];

    if (
      operator === EXPRESSION_OPERATORS.AND ||
      operator === EXPRESSION_OPERATORS.OR
    ) {
      const results: TaskEvaluation[][] = [];

      expression[operator].forEach((condition) => {
        results.push(
          evaluate(evaluationsPerTaskPerModel, condition, metric, annotator),
        );
      });

      if (operator === EXPRESSION_OPERATORS.AND) {
        return intersectionWith(...results, isEqual);
      } else {
        return unionWith(...results, isEqual);
      }
    }
  } else {
    // No logical operator: check each task's evaluations against per-model conditions
    Object.values(evaluationsPerTaskPerModel).forEach((evaluationPerModel) => {
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

          // If comparison operator is "$gt" OR "$gte"
          if (
            (operator === EXPRESSION_OPERATORS.GTE ||
              operator === EXPRESSION_OPERATORS.GT) &&
            (isNaN(value) ||
              value <
                castToNumber(
                  expectation[operator],
                  metric.values,
                  typeof expectation[operator] === 'string'
                    ? 'displayValue'
                    : 'value',
                ))
          ) {
            satisfy = false;
            break;
          }

          // If comparison operator is "$lt" OR "$lte"
          if (
            (operator === EXPRESSION_OPERATORS.LTE ||
              operator === EXPRESSION_OPERATORS.LT) &&
            (isNaN(value) ||
              value >
                castToNumber(
                  expectation[operator],
                  metric.values,
                  typeof expectation[operator] === 'string'
                    ? 'displayValue'
                    : 'value',
                ))
          ) {
            satisfy = false;
            break;
          }

          // If comparison operator is "$eq"
          if (
            operator === EXPRESSION_OPERATORS.EQ &&
            (isNaN(value) ||
              value !==
                castToNumber(
                  expectation[operator],
                  metric.values,
                  typeof expectation[operator] === 'string'
                    ? 'displayValue'
                    : 'value',
                ))
          ) {
            satisfy = false;
            break;
          }

          // If comparison operator is "$neq"
          if (
            operator === EXPRESSION_OPERATORS.NEQ &&
            (isNaN(value) ||
              value ===
                castToNumber(
                  expectation[operator],
                  metric.values,
                  typeof expectation[operator] === 'string'
                    ? 'displayValue'
                    : 'value',
                ))
          ) {
            satisfy = false;
            break;
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
        eligibleEvaluations.push(...Object.values(evaluationPerModel));
      }
    });
  }

  return eligibleEvaluations;
}
