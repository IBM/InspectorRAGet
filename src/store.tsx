/**
 *
 * Copyright 2023-2025 InspectorRAGet Team
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

import { Task, Data } from '@/src/types';

interface DataStoreContext {
  item: Data | undefined;
  set: (data: Data) => void;
  taskMap: Map<string, Task> | undefined;
  updateTask: (taskId: string, update: {}) => void;
}

export const DataStore = createContext<DataStoreContext>({
  item: undefined,
  set(data) {},
  taskMap: new Map<string, Task>(),
  updateTask(taskId, update) {},
});

export function DataStoreProvider({ children }: { children: any }) {
  const [item, setItem] = useState<Data>();
  const [taskMap, setTaskMap] = useState<Map<string, Task>>();

  const set = (data: Data) => {
    // Step 1: Set data
    setItem(data);

    // Step 2: Set task's map based on tasks in data
    setTaskMap(new Map(data.tasks.map((task) => [task.taskId, task])));
  };

  const updateTask = (taskId: string, update: {}) => {
    const task = taskMap?.get(taskId);
    if (task) {
      setTaskMap(new Map(taskMap?.set(taskId, { ...task, ...update })));
    }
  };

  return (
    <DataStore.Provider
      value={{ item: item, set: set, taskMap: taskMap, updateTask: updateTask }}
    >
      {children}
    </DataStore.Provider>
  );
}

export function useDataStore() {
  return useContext(DataStore);
}
