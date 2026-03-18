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

import { isEmpty, isNumber } from 'lodash';
import { hash } from '@/src/utilities/strings';
import {
  Data,
  MetricValue,
  RawData,
  ModelResult,
  DisqualificationReason,
  DisqualifiedTasks,
  Task,
  Notification,
} from '@/src/types';

export const DataErrorKinds = {
  MISSING_METRIC: 'MISSING METRIC',
  MISSING_MODEL: 'MISSING MODEL',
  MISSING_VALUE: 'MISSING VALUE',
};

function sortMetricValues(values: MetricValue[]) {
  values.sort((a, b) => {
    // For string values
    if (typeof a.value === 'string' && typeof b.value === 'string') {
      // Do direct value comparison in numerical values exists
      if (
        (a.numericValue != undefined || a.numericValue != null) &&
        isNumber(a.numericValue) &&
        (b.numericValue != undefined || b.numericValue != null) &&
        isNumber(b.numericValue)
      ) {
        return a.numericValue - b.numericValue;
      }

      // Do string comparison with non-ASCII support
      return a.value.localeCompare(b.value);
    }

    // For numerical values, do direct value comparison
    else if (typeof a.value === 'number' && typeof b.value === 'number') {
      return a.value - b.value;
    }

    // Default: Preserve same order
    return 0;
  });
}

function disqualifyEvaluation(
  reasons: DisqualificationReason[],
  evaluation: ModelResult,
  disqualifiedTasks: DisqualifiedTasks,
  resultsPerTask: { [key: string]: ModelResult[] },
) {
  // If task was previously qualified, move all its results to disqualified
  if (resultsPerTask.hasOwnProperty(evaluation.taskId)) {
    const qualifiedResults = resultsPerTask[evaluation.taskId];
    delete resultsPerTask[evaluation.taskId];

    disqualifiedTasks[evaluation.taskId] = {
      reasons: reasons,
      results: [...qualifiedResults, evaluation],
    };
  } else {
    // Task already disqualified or new: append reasons and result
    if (disqualifiedTasks.hasOwnProperty(evaluation.taskId)) {
      disqualifiedTasks[evaluation.taskId].reasons = [
        ...disqualifiedTasks[evaluation.taskId].reasons,
        ...reasons,
      ];
      disqualifiedTasks[evaluation.taskId].results.push(evaluation);
    } else {
      disqualifiedTasks[evaluation.taskId] = {
        reasons: reasons,
        results: [evaluation],
      };
    }
  }
}

export function processData(
  data: RawData,
  migrated = false,
): [Data, DisqualifiedTasks, Notification[]] {
  const notifications: Notification[] = [];

  const plottableMetrics = data.metrics.filter(
    (metric) => metric.type === 'numerical' || metric.type === 'categorical',
  );
  const requiredModelIDs = new Set(data.models.map((model) => model.modelId));

  // Warn about plottable metrics with no declared aggregator. A default will
  // be applied (average for numerical, majority for categorical) but the
  // researcher should set one explicitly for predictable results.
  const metricsWithoutAggregator = plottableMetrics
    .filter((metric) => !metric.aggregator)
    .map((metric) => metric.displayName ?? metric.name);
  if (metricsWithoutAggregator.length > 0) {
    notifications.push({
      title: 'Default aggregator assumed',
      subtitle: `The following metrics have no aggregator specified and will use a default (mean for numerical, majority for categorical): ${metricsWithoutAggregator.join(', ')}.`,
      kind: 'warning',
    });
  }

  // --- Disqualify results missing required metrics or models ---

  /**
   * Disqualification rules:
   * - Only preserve results for models listed in the models section
   * - A task needs a result for every listed model
   * - Each result must have scores for every plottable metric
   */
  const disqualifiedTasks: DisqualifiedTasks = {};
  const resultsPerTask: { [key: string]: ModelResult[] } = {};

  data.results.forEach((evaluation) => {
    const disqualificationReasons: DisqualificationReason[] = [];
    plottableMetrics.forEach((metric) => {
      if (!evaluation.scores.hasOwnProperty(metric.name)) {
        disqualificationReasons.push({
          kind: DataErrorKinds.MISSING_METRIC,
          data: metric.name,
        });
      } else {
        if (isEmpty(evaluation.scores[metric.name])) {
          disqualificationReasons.push({
            kind: DataErrorKinds.MISSING_VALUE,
            data: metric.name,
          });
        } else {
          for (const evaluator of Object.keys(evaluation.scores[metric.name])) {
            if (
              !evaluation.scores[metric.name][evaluator].hasOwnProperty('value')
            ) {
              disqualificationReasons.push({
                kind: DataErrorKinds.MISSING_VALUE,
                data: metric.name,
              });
            }
          }
        }
      }
    });

    if (isEmpty(disqualificationReasons)) {
      // Only keep results for models listed in the models section
      if (requiredModelIDs.has(evaluation.modelId)) {
        if (resultsPerTask.hasOwnProperty(evaluation.taskId)) {
          resultsPerTask[evaluation.taskId].push(evaluation);
        } else {
          if (disqualifiedTasks.hasOwnProperty(evaluation.taskId)) {
            disqualifiedTasks[evaluation.taskId].results.push(evaluation);
          } else {
            resultsPerTask[evaluation.taskId] = [evaluation];
          }
        }
      }
    } else {
      disqualifyEvaluation(
        disqualificationReasons,
        evaluation,
        disqualifiedTasks,
        resultsPerTask,
      );
    }
  });

  // --- Verify model coverage: every task must have a result per model ---

  // Check already-disqualified tasks for additional missing models
  Object.keys(disqualifiedTasks).forEach((taskId) => {
    if (disqualifiedTasks[taskId].results.length !== data.models.length) {
      const availableModelIDs = new Set(
        disqualifiedTasks[taskId].results.map(
          (evaluation) => evaluation.modelId,
        ),
      );

      const missingModelIDs = [...requiredModelIDs].filter(
        (modelId) => !availableModelIDs.has(modelId),
      );

      if (!isEmpty(missingModelIDs)) {
        disqualifiedTasks[taskId].reasons = [
          ...disqualifiedTasks[taskId].reasons,
          ...missingModelIDs.map((modelId) => {
            return { kind: DataErrorKinds.MISSING_MODEL, data: modelId };
          }),
        ];
      }
    }
  });

  // Check qualified tasks -- demote to disqualified if any model is missing
  Object.keys(resultsPerTask).forEach((taskId) => {
    if (data.models.length !== resultsPerTask[taskId].length) {
      const availableModelIDs = new Set(
        resultsPerTask[taskId].map((evaluation) => evaluation.modelId),
      );
      const missingModelIDs = [...requiredModelIDs].filter(
        (modelId) => !availableModelIDs.has(modelId),
      );

      if (!isEmpty(missingModelIDs)) {
        const disqualifiedResults = resultsPerTask[taskId];
        disqualifiedTasks[taskId] = {
          reasons: missingModelIDs.map((modelId) => {
            return { kind: DataErrorKinds.MISSING_MODEL, data: modelId };
          }),
          results: disqualifiedResults,
        };

        delete resultsPerTask[taskId];
      }
    }
  });

  // --- Flatten qualified results and collect annotators ---

  const uniqueQuailifiedTaskIds = new Set<string>();
  const annotators = new Set<string>();
  const qualifiedResults: ModelResult[] = [];

  Object.keys(resultsPerTask).forEach((taskId) => {
    uniqueQuailifiedTaskIds.add(taskId);
    resultsPerTask[taskId].forEach((evaluation) => {
      Object.keys(evaluation.scores).forEach((metric) => {
        const entry = evaluation.scores[metric];
        Object.keys(entry).forEach((annotator) => annotators.add(annotator));
      });
      qualifiedResults.push(evaluation);
    });
  });

  // --- Build the final qualified task list ---

  const tasksMap = new Map(
    data.tasks.map((task) => {
      return [task.taskId, task];
    }),
  );
  const qualifiedTasks: Task[] = [];
  Array.from(uniqueQuailifiedTaskIds).forEach((taskId) => {
    const task = tasksMap.get(taskId);
    if (task) {
      qualifiedTasks.push(task);
    }
  });

  return [
    {
      name: data.name || 'Example',
      exampleId: hash(JSON.stringify(data)),
      models: data.models,
      metrics: data.metrics.map((metric) => {
        if (metric.values) {
          sortMetricValues(metric.values);
        }

        // Attach computed min/max from sorted values (categorical) or range (numerical)
        return {
          ...metric,
          ...(metric.type === 'categorical' &&
            metric.values && {
              minValue: metric.values[0],
              maxValue: metric.values[metric.values.length - 1],
            }),
          ...(metric.type === 'numerical' &&
            metric.range &&
            metric.range.length >= 2 && {
              minValue: metric.range[0],
              maxValue: metric.range[1],
            }),
        };
      }),
      ...(data.filters && { filters: data.filters }),
      tasks: qualifiedTasks.map((task) => {
        return {
          ...task,
          taskType: task.taskType,
        };
      }),
      documents: data.documents,
      results: qualifiedResults,
      annotators: Array.from(annotators),
      numTasks: qualifiedTasks.length,
      // Carry the migration flag so exportData can show a one-time toast
      // when the researcher downloads the upgraded file.
      ...(migrated && { migrated: true }),
    },
    disqualifiedTasks,
    notifications,
  ];
}
