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
import { validateInputData } from '@/src/validators';

// --- Fixtures ---

function validData() {
  return {
    models: [{ modelId: 'm1', name: 'Model 1', owner: 'owner1' }],
    metrics: [
      {
        name: 'accuracy',
        author: 'algorithm',
        type: 'numerical',
        range: [0, 1],
      },
    ],
    tasks: [
      {
        taskId: 't1',
        taskType: 'generation',
        input: 'Hello world',
      },
    ],
    evaluations: [
      {
        taskId: 't1',
        modelId: 'm1',
        output: { type: 'text', value: 'Hi' },
        scores: { accuracy: { system: { value: 0.9 } } },
      },
    ],
  };
}

function validQAData() {
  return {
    models: [{ modelId: 'm1', name: 'Model 1', owner: 'owner1' }],
    metrics: [
      {
        name: 'faithfulness',
        author: 'algorithm',
        type: 'numerical',
        range: [0, 1],
      },
    ],
    documents: [{ documentId: 'd1', text: 'Some document text' }],
    tasks: [
      {
        taskId: 't1',
        taskType: 'qa',
        input: 'What is X?',
        contexts: [{ documentId: 'd1' }],
      },
    ],
    evaluations: [
      {
        taskId: 't1',
        modelId: 'm1',
        output: { type: 'text', value: 'X is...' },
        scores: { faithfulness: { system: { value: 0.8 } } },
      },
    ],
  };
}

// --- Tests ---

describe('validateInputData', () => {
  it('accepts a valid generation dataset', () => {
    const result = validateInputData(validData());
    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('accepts a valid qa dataset', () => {
    const result = validateInputData(validQAData());
    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  // --- Models validation ---

  it('rejects data missing models', () => {
    const data = validData();
    delete (data as any).models;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("Missing mandatory 'models' information.");
  });

  it('rejects a model missing modelId', () => {
    const data = validData();
    delete (data.models[0] as any).modelId;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
    expect(
      result.reasons.some((r) => r.includes('models are incorrectly')),
    ).toBe(true);
  });

  it('rejects a model missing name', () => {
    const data = validData();
    delete (data.models[0] as any).name;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
  });

  it('rejects a model missing owner', () => {
    const data = validData();
    delete (data.models[0] as any).owner;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
  });

  // --- Metrics validation ---

  it('rejects data missing metrics', () => {
    const data = validData();
    delete (data as any).metrics;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain(
      "Missing mandatory 'metrics' information.",
    );
  });

  it('rejects a metric missing name', () => {
    const data = validData();
    delete (data.metrics[0] as any).name;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
  });

  it('rejects a metric with invalid author', () => {
    const data = validData();
    (data.metrics[0] as any).author = 'robot';
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
  });

  it('rejects a metric with invalid type', () => {
    const data = validData();
    (data.metrics[0] as any).type = 'boolean';
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
  });

  it('rejects a numerical metric with majority aggregator', () => {
    const data = validData();
    (data.metrics[0] as any).aggregator = 'majority';
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
  });

  it('rejects a categorical metric without values', () => {
    const data = validData();
    data.metrics[0] = {
      name: 'quality',
      author: 'human',
      type: 'categorical',
    } as any;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
  });

  it('accepts a categorical metric with valid values', () => {
    const data = validData();
    data.metrics[0] = {
      name: 'quality',
      author: 'human',
      type: 'categorical',
      values: [
        { value: 'good', numericValue: 1 },
        { value: 'bad', numericValue: 0 },
      ],
    } as any;
    const result = validateInputData(data);
    expect(result.valid).toBe(true);
  });

  it('rejects a metric value missing the value field', () => {
    const data = validData();
    data.metrics[0] = {
      name: 'quality',
      author: 'human',
      type: 'categorical',
      values: [{ numericValue: 1 }],
    } as any;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
  });

  // --- Tasks validation ---

  it('rejects data missing tasks', () => {
    const data = validData();
    delete (data as any).tasks;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("Missing mandatory 'tasks' information.");
  });

  it('rejects a task missing taskId', () => {
    const data = validData();
    delete (data.tasks[0] as any).taskId;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
  });

  it('rejects a task with invalid taskType', () => {
    const data = validData();
    (data.tasks[0] as any).taskType = 'summarization';
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
  });

  it('rejects a task missing input', () => {
    const data = validData();
    delete (data.tasks[0] as any).input;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
  });

  it('rejects a qa task missing contexts', () => {
    const data = validQAData();
    delete (data.tasks[0] as any).contexts;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
  });

  it('accepts rag task type', () => {
    const data = validData();
    data.tasks[0] = {
      taskId: 't1',
      taskType: 'rag',
      input: [{ role: 'user', content: 'Hello' }],
    } as any;
    const result = validateInputData(data);
    expect(result.valid).toBe(true);
  });

  // --- Legacy task type names are still accepted (auto-migrated by processor) ---

  it('accepts legacy chat task type', () => {
    const data = validData();
    data.tasks[0] = {
      taskId: 't1',
      taskType: 'chat',
      input: [{ role: 'user', content: 'Hello' }],
    } as any;
    const result = validateInputData(data);
    expect(result.valid).toBe(true);
  });

  it('accepts legacy text_generation task type', () => {
    const data = validData();
    data.tasks[0] = {
      taskId: 't1',
      taskType: 'text_generation',
      input: 'Hello',
    } as any;
    const result = validateInputData(data);
    expect(result.valid).toBe(true);
  });

  it('accepts legacy json_generation task type', () => {
    const data = validData();
    data.tasks[0].taskType = 'json_generation' as any;
    const result = validateInputData(data);
    expect(result.valid).toBe(true);
  });

  // --- Documents validation ---

  it('rejects qa tasks without documents section', () => {
    const data = validQAData();
    delete (data as any).documents;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("'documents'"))).toBe(true);
  });

  it('rejects a document missing documentId', () => {
    const data = validQAData();
    delete (data.documents[0] as any).documentId;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
  });

  // --- Evaluations validation ---

  it('rejects data missing evaluations', () => {
    const data = validData();
    delete (data as any).evaluations;
    const result = validateInputData(data);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain(
      "Missing mandatory 'evaluations' information.",
    );
  });

  // --- Multiple errors ---

  it('collects multiple validation errors', () => {
    const result = validateInputData({});
    expect(result.valid).toBe(false);
    // Should report missing models, metrics, tasks, and evaluations
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
