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
  Document,
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
  // Step 1: Move from evaluations per task list to disqualified tasks list, if required
  if (evaluationsPerTask.hasOwnProperty(evaluation.taskId)) {
    // Step 1.a: Copy task to remove
    const qualifiedEvaluations = evaluationsPerTask[evaluation.taskId];

    // Step 1.b: Remove task from qualified tasks list
    delete evaluationsPerTask[evaluation.taskId];

    // Step 1.c: Add to disqualified tasks list
    disqualifiedTasks[evaluation.taskId] = {
      reasons: reasons,
      evaluations: [...qualifiedEvaluations, evaluation],
    };
  } else {
    // Step 1: Add to disqualified tasks list
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
): [Data, DisqualifiedTasks, Notification[]] {
  // Step 0: Define notifications
  const notifications: Notification[] = [];

  // Step 1: Identify all plottable metrics and required model IDs
  const plottableMetrics = data.metrics.filter(
    (metric) => metric.type === 'numerical' || metric.type === 'categorical',
  );
  const requiredModelIDs = new Set(data.models.map((model) => model.modelId));

  /**
   * Step 2: Disqualify tasks based on following guidelines
   * 1. Only preserve evaluations for models specified in the models sections
   * 2. If task does not have evaluations for all the models from models section
   * 3. If task does not have every metric from metrics section for all the models from models section
   */
  const disqualifiedTasks: DisqualifiedTasks = {};
  const evaluationsPerTask: { [key: string]: TaskEvaluation[] } = {};

  // Step 2.a: Iterate over every evaluation entry
  data.evaluations.forEach((evaluation) => {
    // Step 2.a.i: Verfify annotations for all plottable metrics exist
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

    // Step 2.a.ii: If annotations for all plottable metrics exist
    if (isEmpty(disqualificationReasons)) {
      // Step 2.a.ii.*: Only add if evaluation belongs to one of the models specified in the models section
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
      // Step 2.a.ii: Disqualify evaluation and associated task
      disqualifyEvaluation(
        disqualificationReasons,
        evaluation,
        disqualifiedTasks,
        evaluationsPerTask,
      );
    }
  });

  // Step 3.: Verify evaluations exist for every model from the models section
  // Step 3.a: Check first in all disqualified tasks
  Object.keys(disqualifiedTasks).forEach((taskId) => {
    // Step 3.a.i: If more or less number of evaluations exists
    if (disqualifiedTasks[taskId].evaluations.length !== data.models.length) {
      const availableModelIDs = new Set(
        disqualifiedTasks[taskId].evaluations.map(
          (evaluation) => evaluation.modelId,
        ),
      );

      // Step 3.a.i.*: Missing model IDs
      const missingModelIDs = [...requiredModelIDs].filter(
        (modelId) => !availableModelIDs.has(modelId),
      );

      // Step 3.a.i.**: Update disqualified task's reasons
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

  // Step 3.b: Check in qualified tasks
  Object.keys(evaluationsPerTask).forEach((taskId) => {
    // Step 3.b.i: If more or less number of evaluations exists
    if (data.models.length !== evaluationsPerTask[taskId].length) {
      const availableModelIDs = new Set(
        evaluationsPerTask[taskId].map((evaluation) => evaluation.modelId),
      );
      // Step 3.b.i.*: Missing model IDs
      const missingModelIDs = [...requiredModelIDs].filter(
        (modelId) => !availableModelIDs.has(modelId),
      );

      // Step 3.b.i.**: Move task from qualified task list to disqualified task list
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

  // Step 5: Flatten qualified tasks into qualified evaluations list
  // Step 5.a: Retain unique qaulified task ID, annotator and qualified evaluation
  const uniqueQuailifiedTaskIds = new Set<string>();
  const annotators = new Set<string>();
  const qualifiedEvaluations: TaskEvaluation[] = [];

  // Step 5.b: Iterate over each qualified task
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

  // Step 6: Create a list of qualified tasks
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

  // Step 7: Add warning notification, if qualified tasks has invalid task type
  for (const task of qualifiedTasks) {
    if (
      task.taskType === 'question_answering' ||
      task.taskType === 'conversation'
    ) {
      // Add notification
      notifications.push({
        kind: 'warning',
        title: `Deprecation warning for "${task.taskType}" task type.`,
        subtitle: 'Please migrate to using "rag" task type instead.',
      });

      // Exit
      break;
    }
  }

  return [
    {
      name: data.name || 'Example',
      exampleId: hash(JSON.stringify(data)),
      models: data.models,
      metrics: data.metrics.map((metric) => {
        // Step 1: Sort metric values, if present
        if (metric.values) {
          sortMetricValues(metric.values);
        }

        // Step 2: Return with additional attributes
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
          taskType:
            task.taskType === 'question_answering' ||
            task.taskType === 'conversation'
              ? 'rag'
              : task.taskType,
        };
      }),
      documents: data.documents,
      evaluations: qualifiedEvaluations,
      annotators: Array.from(annotators),
      numTasks: qualifiedTasks.length,
    },
    disqualifiedTasks,
    notifications,
  ];
}

export function exportData(
  data: Data | undefined,
  tasks: Task[] | undefined,
): boolean {
  // Step 0: Verify if data is provided
  if (data) {
    let dataToExport: RawData = {
      name: data.name,
      ...(data.exampleId && { exampleId: data.exampleId }),
      models: data.models,
      metrics: data.metrics,
      ...(data.documents && {
        documents: data.documents,
      }),
      tasks: data.tasks,
      evaluations: data.evaluations,
    };

    // Step 1: If tasks are defined
    if (tasks) {
      // Step 0: update flagged property
      tasks.forEach((task) => {
        if (!task.hasOwnProperty('flagged')) {
          task.flagged = false;
        }
      });

      // Step 1.a: Create reduced analytics data, if not all tasks are specified
      if (data.tasks.length !== tasks.length) {
        // Step 1.a.i: Build documents map
        const documentsMap: Map<string, Document> = new Map(
          data.documents?.map((document) => [document.documentId, document]),
        );

        // Step 1.a.ii: Necessary variables
        const relevantDocuments: Set<Document> = new Set<Document>();
        const relevantTaskIds: Set<string> = new Set<string>();

        // Step 1.a.iii: Iterate over tasks to identify referened documents/relevant context
        tasks.forEach((task) => {
          // Add task ID to relevant task ID set
          relevantTaskIds.add(task.taskId);

          if (documentsMap.size !== 0) {
            task.contexts.forEach((context) => {
              // Add referenced document to relevant documents list
              if (typeof context !== 'string') {
                const referenceDocument = documentsMap.get(context.documentId);
                if (referenceDocument) {
                  relevantDocuments.add(referenceDocument);
                }
              }
            });
          }
        });

        // Step 1.a.iv: Create an object to be exported
        dataToExport = {
          name: data.name,
          ...(data.exampleId && { exampleId: data.exampleId }),
          models: data.models,
          metrics: data.metrics,
          ...(relevantDocuments.size !== 0 && {
            documents: Array.from(relevantDocuments),
          }),
          tasks: tasks,
          evaluations: data.evaluations.filter((evaluation) =>
            relevantTaskIds.has(evaluation.taskId),
          ),
        };
      } else {
        // Step 1.b: Create an object to be exported by copying over tasks information
        dataToExport = {
          name: data.name,
          ...(data.exampleId && { exampleId: data.exampleId }),
          models: data.models,
          metrics: data.metrics,
          ...(data.documents && {
            documents: data.documents,
          }),
          tasks: tasks,
          evaluations: data.evaluations,
        };
      }
    }

    // Step 2: Create <a> tag
    var element = document.createElement('a');

    // Step 2.a: Set attributes
    element.setAttribute(
      'href',
      'data:application/json;charset=utf-8, ' +
        encodeURIComponent(JSON.stringify(dataToExport)),
    );
    element.setAttribute('download', 'analytics.json');

    // Step 2.b: Add to DOM tree and click it
    document.body.appendChild(element);
    element.click();

    // Step 2.c : Cleanup
    document.body.removeChild(element);

    // Step 3: Retun "true" indicating success
    return true;
  }

  // Step 3: Retun "false" indicating failure
  return false;
}
