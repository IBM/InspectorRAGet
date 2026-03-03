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

import QATaskView from '@/src/task-types/qa/TaskView';
import QACopier from '@/src/task-types/qa/Copier';
import GenerationTaskView from '@/src/task-types/generation/TaskView';
import GenerationCopier from '@/src/task-types/generation/Copier';
import RAGTaskView from '@/src/task-types/rag/TaskView';
import RAGCopier from '@/src/task-types/rag/Copier';

export const taskTypeRegistry = {
  qa: { TaskView: QATaskView, Copier: QACopier },
  generation: { TaskView: GenerationTaskView, Copier: GenerationCopier },
  rag: { TaskView: RAGTaskView, Copier: RAGCopier },
} as const;
