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

import { isEmpty } from 'lodash';

import { RequestMessage, TaskEvaluation } from '@/src/types';
import { areObjectsIntersecting } from '@/src/utilities/objects';
import { evaluate } from '@/src/utilities/expressions';

onmessage = function (event: MessageEvent<RequestMessage>) {
  // Step 1: Initialize necessary variables
  const {
    evaluationsPerMetric,
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
  const visibleEvaluations: TaskEvaluation[] = [];

  // Step 2: If filters are specified
  const filteredEvaluationsPerMetric: { [key: string]: TaskEvaluation[] } = {};
  for (const [metric, evals] of Object.entries(evaluationsPerMetric)) {
    filteredEvaluationsPerMetric[metric] = !isEmpty(filters)
      ? evals.filter((e) => areObjectsIntersecting(filters, e))
      : evals;
  }

  // Step 3: If a metric is selected
  if (metric) {
    // Step 3.a: If an expression is specified
    if (event.data.expression && !isEmpty(event.data.expression)) {
      // Step 3.a.ii: Build an object containing evaluations per model for every task
      const evaluationsPerTaskPerModel: {
        [key: string]: { [key: string]: TaskEvaluation };
      } = {};
      filteredEvaluationsPerMetric[metric.name].forEach((evaluation) => {
        if (evaluationsPerTaskPerModel.hasOwnProperty(evaluation.taskId)) {
          evaluationsPerTaskPerModel[evaluation.taskId][evaluation.modelId] =
            evaluation;
        } else {
          evaluationsPerTaskPerModel[evaluation.taskId] = {
            [evaluation.modelId]: evaluation,
          };
        }
      });

      // Step 3.a.iii: Find evaluations meeting expression criteria
      evaluate(
        evaluationsPerTaskPerModel,
        expression,
        metric,
        annotator,
      ).forEach((evaluation) => {
        // Step 3.a.iii.*: Create and add record
        records.push({
          taskId: evaluation.taskId,
          modelName: models[evaluation.modelId].name,
          [`${metric.name}_value`]: evaluation[`${metric.name}_agg`].value,
          [`${metric.name}_aggLevel`]: evaluation[`${metric.name}_agg`].level,
        });

        // Step 3.a.iii.**: Add evaluation
        visibleEvaluations.push(evaluation);
      });
    } else {
      // Step 3.b: Filter evaluations for the selected metric
      filteredEvaluationsPerMetric[metric.name].forEach((evaluation) => {
        // Step 3.b.i: If individual annotator is selected, verify against annotator's value
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
              isEmpty(allowedValues) ||
              allowedValues.includes(evaluation[metric.name][annotator].value))
          ) {
            // Step 3.b.i.*: Create and add record
            records.push({
              taskId: evaluation.taskId,
              modelName: models[evaluation.modelId].name,
              [`${metric.name}_value`]:
                evaluation[metric.name][annotator].value,
            });

            // Step 3.b.i.**: Add evaluation
            visibleEvaluations.push(evaluation);
          }
        } else {
          // Step 3.b.ii: Verify against aggregate value
          if (
            evaluation.modelId in models &&
            event.data.agreementLevels
              .map((level) => level.value)
              .includes(evaluation[`${metric.name}_agg`].level) &&
            (!allowedValues ||
              isEmpty(allowedValues) ||
              allowedValues.includes(evaluation[`${metric.name}_agg`].value))
          ) {
            // Step 3.b.ii.*: Create and add record
            records.push({
              taskId: evaluation.taskId,
              modelName: models[evaluation.modelId].name,
              [`${metric.name}_value`]: evaluation[`${metric.name}_agg`].value,
              [`${metric.name}_aggLevel`]:
                evaluation[`${metric.name}_agg`].level,
            });

            // Step 3.b.ii.**: Add evaluation
            visibleEvaluations.push(evaluation);
          }
        }
      });
    }
  } else {
    // Step 3: For every metric
    for (const [metric, evaluations] of Object.entries(
      filteredEvaluationsPerMetric,
    )) {
      evaluations.forEach((evaluation) => {
        // Step 3.a: If invidiual annotator is selected, verify against annotator's value
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
              isEmpty(allowedValues) ||
              allowedValues.includes(evaluation[metric][annotator].value))
          ) {
            records.push({
              taskId: evaluation.taskId,
              modelName: models[evaluation.modelId].name,
              [`${metric}_value`]: evaluation[metric][annotator].value,
            });
          }
        } else {
          // Step 3.a: Verify against aggregate value
          if (
            evaluation.modelId in models &&
            agreementLevels
              .map((level) => level.value)
              .includes(evaluation[`${metric}_agg`].level) &&
            (!allowedValues ||
              isEmpty(allowedValues) ||
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

  // Step 4: Return results
  postMessage({ records: records, evaluations: visibleEvaluations });
};
