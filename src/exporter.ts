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

import { snakeCaseKeys } from '@/src/utilities/objects';
import { Data, Task, RawData } from '@/src/types';
import { RetrievedDocument } from '@/src/task-types/qa/types';
import { CURRENT_SCHEMA_VERSION } from '@/src/migrator';

export function exportData(
  data: Data | undefined,
  tasks: Task[] | undefined,
): boolean {
  if (data) {
    let dataToExport: RawData = {
      schema_version: CURRENT_SCHEMA_VERSION,
      name: data.name,
      ...(data.exampleId && { exampleId: data.exampleId }),
      ...(data.filters && { filters: data.filters }),
      models: data.models,
      metrics: data.metrics,
      ...(data.documents && {
        documents: data.documents,
      }),
      tasks: data.tasks,
      evaluations: data.evaluations.map((evaluation) => {
        return {
          taskId: evaluation.taskId,
          modelId: evaluation.modelId,
          modelResponse: evaluation.modelResponse,
          annotations: evaluation.annotations,
          ...(evaluation.contexts && { contexts: evaluation.contexts }),
        };
      }),
    };

    if (tasks) {
      // Ensure every task has a flagged property before export
      tasks.forEach((task) => {
        if (!task.hasOwnProperty('flagged')) {
          task.flagged = false;
        }
      });

      // Subset export: only include documents and evaluations for the given tasks
      if (data.tasks.length !== tasks.length) {
        const documentsMap: Map<string, RetrievedDocument> = new Map(
          data.documents?.map((document) => [document.documentId, document]),
        );

        const relevantDocuments: Set<RetrievedDocument> =
          new Set<RetrievedDocument>();
        const relevantTaskIds: Set<string> = new Set<string>();

        // Collect referenced document IDs from the subset of tasks
        tasks.forEach((task) => {
          relevantTaskIds.add(task.taskId);

          if (documentsMap.size !== 0) {
            task.contexts?.forEach((context) => {
              if (typeof context !== 'string') {
                const referenceDocument = documentsMap.get(context.documentId);
                if (referenceDocument) {
                  relevantDocuments.add(referenceDocument);
                }
              }
            });
          }
        });

        dataToExport = {
          schema_version: CURRENT_SCHEMA_VERSION,
          name: data.name,
          ...(data.exampleId && { exampleId: data.exampleId }),
          ...(data.filters && { filters: data.filters }),
          models: data.models,
          metrics: data.metrics,
          ...(relevantDocuments.size !== 0 && {
            documents: Array.from(relevantDocuments),
          }),
          tasks: tasks,
          evaluations: data.evaluations
            .filter((evaluation) => relevantTaskIds.has(evaluation.taskId))
            .map((evaluation) => {
              return {
                taskId: evaluation.taskId,
                modelId: evaluation.modelId,
                modelResponse: evaluation.modelResponse,
                annotations: evaluation.annotations,
                ...(evaluation.contexts && { contexts: evaluation.contexts }),
              };
            }),
        };
      } else {
        // Full export: all tasks provided, just copy tasks with their flagged state
        dataToExport = {
          schema_version: CURRENT_SCHEMA_VERSION,
          name: data.name,
          ...(data.exampleId && { exampleId: data.exampleId }),
          ...(data.filters && { filters: data.filters }),
          models: data.models,
          metrics: data.metrics,
          ...(data.documents && {
            documents: data.documents,
          }),
          tasks: tasks,
          evaluations: data.evaluations.map((evaluation) => {
            return {
              taskId: evaluation.taskId,
              modelId: evaluation.modelId,
              modelResponse: evaluation.modelResponse,
              annotations: evaluation.annotations,
              ...(evaluation.contexts && { contexts: evaluation.contexts }),
            };
          }),
        };
      }
    }

    // Trigger a browser download via a temporary anchor element
    var element = document.createElement('a');
    element.setAttribute(
      'href',
      'data:application/json;charset=utf-8, ' +
        encodeURIComponent(JSON.stringify(snakeCaseKeys(dataToExport))),
    );
    element.setAttribute('download', 'analytics.json');

    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    return true;
  }

  return false;
}
