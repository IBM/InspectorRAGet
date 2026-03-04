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

import { createContext, useState, useContext } from 'react';

import { Task, ModelResult, Data } from '@/src/types';

interface DataStoreContext {
  item: Data | undefined;
  set: (data: Data) => void;
  taskMap: Map<string, Task> | undefined;
  updateTask: (taskId: string, update: Partial<Task>) => void;
  resultsMap: Map<string, ModelResult> | undefined;
  updateResult: (
    taskId: string,
    modelId: string,
    update: Partial<ModelResult>,
  ) => void;
}

export const DataStore = createContext<DataStoreContext>({
  item: undefined,
  set(data) {},
  taskMap: new Map<string, Task>(),
  updateTask(taskId, update) {},
  resultsMap: new Map<string, ModelResult>(),
  updateResult(taskId, modelId, update) {},
});

export function DataStoreProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<Data>();
  const [taskMap, setTaskMap] = useState<Map<string, Task>>();
  const [resultsMap, setResultsMap] = useState<Map<string, ModelResult>>();

  const set = (data: Data) => {
    setItem(data);
    setTaskMap(new Map(data.tasks.map((task) => [task.taskId, task])));
    setResultsMap(
      new Map(data.results.map((r) => [`${r.taskId}::${r.modelId}`, r])),
    );
  };

  const updateTask = (taskId: string, update: Partial<Task>) => {
    setTaskMap((prev) => {
      if (!prev) return prev;
      const task = prev.get(taskId);
      if (!task) return prev;

      // Build a new Map from the previous one, then set the updated entry
      const next = new Map(prev);
      next.set(taskId, { ...task, ...update });
      return next;
    });
  };

  const updateResult = (
    taskId: string,
    modelId: string,
    update: Partial<ModelResult>,
  ) => {
    setResultsMap((prev) => {
      if (!prev) return prev;
      const key = `${taskId}::${modelId}`;
      const result = prev.get(key);
      if (!result) return prev;
      const next = new Map(prev);
      next.set(key, { ...result, ...update });
      return next;
    });
  };

  return (
    <DataStore.Provider
      value={{ item, set, taskMap, updateTask, resultsMap, updateResult }}
    >
      {children}
    </DataStore.Provider>
  );
}

export function useDataStore() {
  return useContext(DataStore);
}
