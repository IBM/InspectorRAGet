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
  TaskEvaluation,
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
  evaluation: TaskEvaluation,
  disqualifiedTasks: DisqualifiedTasks,
  evaluationsPerTask: { [key: string]: TaskEvaluation[] },
) {
  // If task was previously qualified, move all its evaluations to disqualified
  if (evaluationsPerTask.hasOwnProperty(evaluation.taskId)) {
    const qualifiedEvaluations = evaluationsPerTask[evaluation.taskId];
    delete evaluationsPerTask[evaluation.taskId];

    disqualifiedTasks[evaluation.taskId] = {
      reasons: reasons,
      evaluations: [...qualifiedEvaluations, evaluation],
    };
  } else {
    // Task already disqualified or new: append reasons and evaluation
    if (disqualifiedTasks.hasOwnProperty(evaluation.taskId)) {
      disqualifiedTasks[evaluation.taskId].reasons = [
        ...disqualifiedTasks[evaluation.taskId].reasons,
        ...reasons,
      ];
      disqualifiedTasks[evaluation.taskId].evaluations.push(evaluation);
    } else {
      disqualifiedTasks[evaluation.taskId] = {
        reasons: reasons,
        evaluations: [evaluation],
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

  // --- Disqualify evaluations missing required metrics or models ---

  /**
   * Disqualification rules:
   * - Only preserve evaluations for models listed in the models section
   * - A task needs evaluations for every listed model
   * - Each evaluation must have annotations for every plottable metric
   */
  const disqualifiedTasks: DisqualifiedTasks = {};
  const evaluationsPerTask: { [key: string]: TaskEvaluation[] } = {};

  data.evaluations.forEach((evaluation) => {
    const disqualificationReasons: DisqualificationReason[] = [];
    plottableMetrics.forEach((metric) => {
      if (!evaluation.annotations.hasOwnProperty(metric.name)) {
        disqualificationReasons.push({
          kind: DataErrorKinds.MISSING_METRIC,
          data: metric.name,
        });
      } else {
        if (isEmpty(evaluation.annotations[metric.name])) {
          disqualificationReasons.push({
            kind: DataErrorKinds.MISSING_VALUE,
            data: metric.name,
          });
        } else {
          for (const evaluator of Object.keys(
            evaluation.annotations[metric.name],
          )) {
            if (
              !evaluation.annotations[metric.name][evaluator].hasOwnProperty(
                'value',
              )
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
      // Only keep evaluations for models listed in the models section
      if (requiredModelIDs.has(evaluation.modelId)) {
        if (evaluationsPerTask.hasOwnProperty(evaluation.taskId)) {
          evaluationsPerTask[evaluation.taskId].push(evaluation);
        } else {
          if (disqualifiedTasks.hasOwnProperty(evaluation.taskId)) {
            disqualifiedTasks[evaluation.taskId].evaluations.push(evaluation);
          } else {
            evaluationsPerTask[evaluation.taskId] = [evaluation];
          }
        }
      }
    } else {
      disqualifyEvaluation(
        disqualificationReasons,
        evaluation,
        disqualifiedTasks,
        evaluationsPerTask,
      );
    }
  });

  // --- Verify model coverage: every task must have an evaluation per model ---

  // Check already-disqualified tasks for additional missing models
  Object.keys(disqualifiedTasks).forEach((taskId) => {
    if (disqualifiedTasks[taskId].evaluations.length !== data.models.length) {
      const availableModelIDs = new Set(
        disqualifiedTasks[taskId].evaluations.map(
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
  Object.keys(evaluationsPerTask).forEach((taskId) => {
    if (data.models.length !== evaluationsPerTask[taskId].length) {
      const availableModelIDs = new Set(
        evaluationsPerTask[taskId].map((evaluation) => evaluation.modelId),
      );
      const missingModelIDs = [...requiredModelIDs].filter(
        (modelId) => !availableModelIDs.has(modelId),
      );

      if (!isEmpty(missingModelIDs)) {
        const disqualifiedEvaluations = evaluationsPerTask[taskId];
        disqualifiedTasks[taskId] = {
          reasons: missingModelIDs.map((modelId) => {
            return { kind: DataErrorKinds.MISSING_MODEL, data: modelId };
          }),
          evaluations: disqualifiedEvaluations,
        };

        delete evaluationsPerTask[taskId];
      }
    }
  });

  // --- Flatten qualified evaluations and collect annotators ---

  const uniqueQuailifiedTaskIds = new Set<string>();
  const annotators = new Set<string>();
  const qualifiedEvaluations: TaskEvaluation[] = [];

  Object.keys(evaluationsPerTask).forEach((taskId) => {
    uniqueQuailifiedTaskIds.add(taskId);
    evaluationsPerTask[taskId].forEach((evaluation) => {
      Object.keys(evaluation.annotations).forEach((metric) => {
        const entry = evaluation.annotations[metric];
        Object.keys(entry).forEach((annotator) => annotators.add(annotator));
      });
      qualifiedEvaluations.push(evaluation);
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
      evaluations: qualifiedEvaluations,
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
