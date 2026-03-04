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

import { describe, it, expect } from 'vitest';
import { migrateData, CURRENT_SCHEMA_VERSION } from '@/src/migrator';

// --- Helpers ---

function v1Base(taskOverrides: Record<string, any> = {}) {
  return {
    // No schema_version field — implicit v1
    name: 'Test',
    models: [],
    metrics: [],
    tasks: [{ task_id: 't1', input: 'Hello', ...taskOverrides }],
    evaluations: [],
  };
}

// --- migrateData: version detection ---

describe('migrateData', () => {
  it('does not migrate data already at the current schema version', () => {
    const raw = { ...v1Base(), schema_version: CURRENT_SCHEMA_VERSION };
    const { data, migrated } = migrateData(raw);
    expect(migrated).toBe(false);
    expect(data).toBe(raw); // same reference — no copy made
  });

  it('returns migrated=false when schema_version equals current', () => {
    const { migrated } = migrateData({
      schema_version: CURRENT_SCHEMA_VERSION,
      tasks: [],
    });
    expect(migrated).toBe(false);
  });

  it('sets migrated=true when migration runs', () => {
    const { migrated } = migrateData(v1Base({ task_type: 'text_generation' }));
    expect(migrated).toBe(true);
  });

  it('stamps schema_version on the output', () => {
    const { data } = migrateData(v1Base({ task_type: 'text_generation' }));
    expect(data.schema_version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('does not mutate the original input', () => {
    const raw = v1Base({ task_type: 'text_generation' });
    const originalTaskType = raw.tasks[0].task_type;
    migrateData(raw);
    expect(raw.tasks[0].task_type).toBe(originalTaskType);
  });

  // --- v1 → v2: task type renames ---

  it('renames text_generation → generation', () => {
    const { data } = migrateData(v1Base({ task_type: 'text_generation' }));
    expect(data.tasks[0].task_type).toBe('generation');
  });

  it('renames json_generation → generation', () => {
    const { data } = migrateData(v1Base({ task_type: 'json_generation' }));
    expect(data.tasks[0].task_type).toBe('generation');
  });

  it('renames chat → rag', () => {
    const { data } = migrateData(
      v1Base({ task_type: 'chat', input: [{ role: 'user', content: 'Hi' }] }),
    );
    expect(data.tasks[0].task_type).toBe('rag');
  });

  it('renames single-turn rag → qa (non-message-array input)', () => {
    const { data } = migrateData(
      v1Base({ task_type: 'rag', input: 'What is X?' }),
    );
    expect(data.tasks[0].task_type).toBe('qa');
  });

  it('keeps multi-turn rag as rag (message-array input with role field)', () => {
    const { data } = migrateData(
      v1Base({
        task_type: 'rag',
        input: [{ role: 'user', content: 'Hello' }],
      }),
    );
    expect(data.tasks[0].task_type).toBe('rag');
  });

  it('leaves current task types untouched during migration', () => {
    const { data } = migrateData(v1Base({ task_type: 'generation' }));
    expect(data.tasks[0].task_type).toBe('generation');
  });

  it('renames evaluations key to results', () => {
    const raw = {
      tasks: [{ task_id: 't1', task_type: 'generation', input: 'hi' }],
      models: [],
      metrics: [],
      evaluations: [
        {
          task_id: 't1',
          model_id: 'm1',
          model_response: 'hello',
          annotations: { accuracy: { system: { value: 0.9 } } },
        },
      ],
    };
    const { data } = migrateData(raw);
    expect(data.results).toHaveLength(1);
    expect(data.evaluations).toBeUndefined();
  });

  it('migrates all tasks in a multi-task file', () => {
    const raw = {
      name: 'Multi',
      tasks: [
        { task_id: 't1', task_type: 'text_generation', input: 'Hi' },
        {
          task_id: 't2',
          task_type: 'chat',
          input: [{ role: 'user', content: 'Hi' }],
        },
        { task_id: 't3', task_type: 'rag', input: 'question' },
      ],
      models: [],
      metrics: [],
      evaluations: [],
    };
    const { data, migrated } = migrateData(raw);
    expect(migrated).toBe(true);
    expect(data.tasks[0].task_type).toBe('generation');
    expect(data.tasks[1].task_type).toBe('rag');
    expect(data.tasks[2].task_type).toBe('qa');
  });
});
