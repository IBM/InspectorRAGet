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

'use client';

import { Metric, Model, Task, TaskEvaluation } from '@/src/types';
import { RetrievedDocument } from '@/src/task-types/qa/types';
import { taskTypeRegistry } from '@/src/task-types';

interface Props {
  models: Model[];
  metrics: Metric[];
  task: Task;
  evaluations: TaskEvaluation[];
  onClose: Function;
  open: boolean;
  documents?: RetrievedDocument[];
}

export default function TaskCopierModal({
  models,
  metrics,
  task,
  evaluations,
  onClose,
  open = false,
  documents,
}: Props) {
  // Look up the task-type-specific copier from the registry.
  const Copier = taskTypeRegistry[task.taskType]?.Copier;
  if (!Copier) {
    return null;
  }

  return (
    <Copier
      models={models}
      metrics={metrics}
      task={task}
      evaluations={evaluations}
      onClose={onClose}
      open={open}
      documents={documents}
    />
  );
}
