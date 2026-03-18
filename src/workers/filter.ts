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

import { isEmpty } from 'lodash';

import { FilterationRequest, ModelResult } from '@/src/types';
import { areObjectsIntersecting } from '@/src/utilities/objects';
import { evaluate } from '@/src/utilities/expressions';

onmessage = function (event: MessageEvent<FilterationRequest>) {
  const {
    resultsPerMetric,
    filters,
    expression,
    agreementLevels,
    metric,
    allowedValues,
    annotator,
  } = event.data;
  const models = event.data.models.reduce(
    (obj, item) => ((obj[item.modelId] = item), obj),
    {},
  );
  const records: {
    taskId: string;
    modelName: string;
    [key: string]: string | number;
  }[] = [];
  const visibleResults: ModelResult[] = [];

  // Apply task-level filters when specified
  const filteredResultsPerMetric: { [key: string]: ModelResult[] } = {};
  for (const [metric, evals] of Object.entries(resultsPerMetric)) {
    filteredResultsPerMetric[metric] = !isEmpty(filters)
      ? evals.filter((e) => areObjectsIntersecting(filters, e))
      : evals;
  }

  if (metric) {
    if (expression && !isEmpty(expression)) {
      // Group results by task and model so the expression can compare across models
      const resultsPerTaskPerModel: {
        [key: string]: { [key: string]: ModelResult };
      } = {};
      filteredResultsPerMetric[metric.name].forEach((evaluation) => {
        if (resultsPerTaskPerModel.hasOwnProperty(evaluation.taskId)) {
          resultsPerTaskPerModel[evaluation.taskId][evaluation.modelId] =
            evaluation;
        } else {
          resultsPerTaskPerModel[evaluation.taskId] = {
            [evaluation.modelId]: evaluation,
          };
        }
      });

      evaluate(resultsPerTaskPerModel, expression, metric, annotator).forEach(
        (evaluation) => {
          // Skip results whose modelId is not in the current selected models index.
          // This can happen when evaluate() returns all models for a matching task
          // and some of those models were deselected by the user.
          if (!models[evaluation.modelId]) return;

          records.push({
            taskId: evaluation.taskId,
            modelName: models[evaluation.modelId].name,
            [`${metric.name}_value`]: evaluation[`${metric.name}_agg`].value,
            [`${metric.name}_aggLevel`]: evaluation[`${metric.name}_agg`].level,
          });

          visibleResults.push(evaluation);
        },
      );
    } else {
      // No expression: filter results directly for the selected metric
      filteredResultsPerMetric[metric.name].forEach((evaluation) => {
        if (annotator) {
          /**
           * Evaluation's model id fall within selected models
           * OR
           * Evaluation's selected metric's value fall within allowed values
           */
          if (
            evaluation.modelId in models &&
            evaluation[metric.name].hasOwnProperty(annotator) &&
            (!allowedValues ||
              allowedValues.includes(evaluation[metric.name][annotator].value))
          ) {
            records.push({
              taskId: evaluation.taskId,
              modelName: models[evaluation.modelId].name,
              [`${metric.name}_value`]:
                evaluation[metric.name][annotator].value,
            });

            visibleResults.push(evaluation);
          }
        } else {
          if (
            evaluation.modelId in models &&
            (!agreementLevels ||
              agreementLevels
                .map((level) => level.value)
                .includes(evaluation[`${metric.name}_agg`].level)) &&
            (!allowedValues ||
              allowedValues.includes(evaluation[`${metric.name}_agg`].value))
          ) {
            records.push({
              taskId: evaluation.taskId,
              modelName: models[evaluation.modelId].name,
              [`${metric.name}_value`]: evaluation[`${metric.name}_agg`].value,
              [`${metric.name}_aggLevel`]:
                evaluation[`${metric.name}_agg`].level,
            });

            visibleResults.push(evaluation);
          }
        }
      });
    }
  } else {
    // No specific metric selected: iterate all metrics
    for (const [metric, results] of Object.entries(filteredResultsPerMetric)) {
      results.forEach((evaluation) => {
        if (annotator) {
          /**
           * Evaluation's model id fall within selected models
           * OR
           * Evaluation's selected metric's value fall within allowed values
           */
          if (
            evaluation.modelId in models &&
            evaluation[metric].hasOwnProperty(annotator) &&
            (!allowedValues ||
              allowedValues.includes(evaluation[metric][annotator].value))
          ) {
            records.push({
              taskId: evaluation.taskId,
              modelName: models[evaluation.modelId].name,
              [`${metric}_value`]: evaluation[metric][annotator].value,
            });
          }
        } else {
          if (
            evaluation.modelId in models &&
            (!agreementLevels ||
              agreementLevels
                .map((level) => level.value)
                .includes(evaluation[`${metric}_agg`].level)) &&
            (!allowedValues ||
              allowedValues.includes(evaluation[`${metric}_agg`].value))
          ) {
            records.push({
              taskId: evaluation.taskId,
              modelName: models[evaluation.modelId].name,
              [`${metric}_value`]: evaluation[`${metric}_agg`].value,
              [`${metric}_aggLevel`]: evaluation[`${metric}_agg`].level,
            });
          }
        }
      });
    }
  }

  postMessage({ records: records, results: visibleResults });
};
