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

import { Task, ModelResult } from '@/src/types';

/**
 * Total comment count across a task and all its model results.
 * Comments can live at two levels: task-level (observations shared across
 * models) and model-result-level (per-model evaluation notes).
 */
export function totalCommentCount(task: Task, results: ModelResult[]): number {
  const taskCount = task.comments?.length ?? 0;
  const resultCount = results.reduce(
    (sum, r) => sum + (r.comments?.length ?? 0),
    0,
  );
  return taskCount + resultCount;
}
