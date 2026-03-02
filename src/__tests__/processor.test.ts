import { describe, it, expect } from 'vitest';
import { processData, DataErrorKinds } from '@/src/processor';
import { RawData } from '@/src/types';

// --- Fixtures ---

function minimalData(overrides?: Partial<RawData>): RawData {
  return {
    name: 'Test',
    models: [
      { modelId: 'm1', name: 'Model 1', owner: 'owner1' },
      { modelId: 'm2', name: 'Model 2', owner: 'owner2' },
    ],
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
        taskType: 'text_generation',
        input: [{ speaker: 'user', text: 'Hello' }],
      },
    ],
    evaluations: [
      {
        taskId: 't1',
        modelId: 'm1',
        modelResponse: 'Hi there',
        annotations: { accuracy: { system: { value: 0.9 } } },
      },
      {
        taskId: 't1',
        modelId: 'm2',
        modelResponse: 'Hey',
        annotations: { accuracy: { system: { value: 0.8 } } },
      },
    ],
    ...overrides,
  } as RawData;
}

// --- processData: basic qualification ---

describe('processData', () => {
  it('qualifies tasks that have evaluations for all models and all metrics', () => {
    const [data, disqualified] = processData(minimalData());
    expect(data.tasks).toHaveLength(1);
    expect(data.evaluations).toHaveLength(2);
    expect(data.numTasks).toBe(1);
    expect(Object.keys(disqualified)).toHaveLength(0);
  });

  it('uses the provided name or defaults to "Example"', () => {
    const [withName] = processData(minimalData({ name: 'My Experiment' }));
    expect(withName.name).toBe('My Experiment');

    const noName = minimalData();
    delete (noName as any).name;
    const [withDefault] = processData(noName);
    expect(withDefault.name).toBe('Example');
  });

  it('preserves model and metric data', () => {
    const [data] = processData(minimalData());
    expect(data.models).toHaveLength(2);
    expect(data.metrics).toHaveLength(1);
    expect(data.metrics[0].name).toBe('accuracy');
  });

  it('extracts annotator IDs from evaluations', () => {
    const [data] = processData(minimalData());
    expect(data.annotators).toContain('system');
  });

  // --- Disqualification: missing metrics ---

  it('disqualifies a task when an evaluation is missing a metric annotation', () => {
    const raw = minimalData();
    raw.evaluations[0] = {
      taskId: 't1',
      modelId: 'm1',
      modelResponse: 'Hi',
      annotations: {},
    } as any;

    const [data, disqualified] = processData(raw);
    expect(data.tasks).toHaveLength(0);
    expect(Object.keys(disqualified)).toContain('t1');
    expect(
      disqualified['t1'].reasons.some(
        (r) => r.kind === DataErrorKinds.MISSING_METRIC,
      ),
    ).toBe(true);
  });

  it('disqualifies a task when a metric annotation has empty evaluators', () => {
    const raw = minimalData();
    raw.evaluations[0] = {
      taskId: 't1',
      modelId: 'm1',
      modelResponse: 'Hi',
      annotations: { accuracy: {} },
    } as any;

    const [data, disqualified] = processData(raw);
    expect(data.tasks).toHaveLength(0);
    expect(
      disqualified['t1'].reasons.some(
        (r) => r.kind === DataErrorKinds.MISSING_VALUE,
      ),
    ).toBe(true);
  });

  it('disqualifies a task when an annotation is missing the value field', () => {
    const raw = minimalData();
    raw.evaluations[0] = {
      taskId: 't1',
      modelId: 'm1',
      modelResponse: 'Hi',
      annotations: { accuracy: { system: { timestamp: 123 } } },
    } as any;

    const [data, disqualified] = processData(raw);
    expect(data.tasks).toHaveLength(0);
    expect(
      disqualified['t1'].reasons.some(
        (r) => r.kind === DataErrorKinds.MISSING_VALUE,
      ),
    ).toBe(true);
  });

  // --- Disqualification: missing models ---

  it('disqualifies a task when not all models have evaluations', () => {
    const raw = minimalData();
    // Remove evaluation for m2
    raw.evaluations = [raw.evaluations[0]];

    const [data, disqualified] = processData(raw);
    expect(data.tasks).toHaveLength(0);
    expect(
      disqualified['t1'].reasons.some(
        (r) => r.kind === DataErrorKinds.MISSING_MODEL,
      ),
    ).toBe(true);
  });

  it('ignores evaluations for models not in the models list', () => {
    const raw = minimalData();
    // Add evaluation for unlisted model
    raw.evaluations.push({
      taskId: 't1',
      modelId: 'unknown_model',
      modelResponse: 'Yo',
      annotations: { accuracy: { system: { value: 0.5 } } },
    } as any);

    const [data] = processData(raw);
    // Should still qualify with the two known models
    expect(data.evaluations).toHaveLength(2);
    expect(data.evaluations.every((e) => e.modelId !== 'unknown_model')).toBe(
      true,
    );
  });

  // --- Text-only metrics are not used for qualification ---

  it('does not use text metrics for qualification', () => {
    const raw = minimalData({
      metrics: [
        {
          name: 'accuracy',
          author: 'algorithm',
          type: 'numerical',
          range: [0, 1],
        },
        { name: 'explanation', author: 'algorithm', type: 'text' },
      ],
    });
    // Evaluations only have 'accuracy', not 'explanation'
    const [data] = processData(raw);
    expect(data.tasks).toHaveLength(1);
  });

  // --- Categorical metric value sorting ---

  it('sorts categorical metric values by numericValue', () => {
    const raw = minimalData({
      metrics: [
        {
          name: 'quality',
          author: 'human',
          type: 'categorical',
          values: [
            { value: 'high', numericValue: 3 },
            { value: 'low', numericValue: 1 },
            { value: 'medium', numericValue: 2 },
          ],
        },
      ],
    });
    raw.evaluations = [
      {
        taskId: 't1',
        modelId: 'm1',
        modelResponse: 'Hi',
        annotations: { quality: { human1: { value: 'high' } } },
      },
      {
        taskId: 't1',
        modelId: 'm2',
        modelResponse: 'Hey',
        annotations: { quality: { human1: { value: 'low' } } },
      },
    ] as any;

    const [data] = processData(raw);
    const qualityMetric = data.metrics.find((m) => m.name === 'quality');
    expect(qualityMetric?.values?.[0].value).toBe('low');
    expect(qualityMetric?.values?.[2].value).toBe('high');
  });

  it('sets minValue and maxValue for categorical metrics', () => {
    const raw = minimalData({
      metrics: [
        {
          name: 'quality',
          author: 'human',
          type: 'categorical',
          values: [
            { value: 'good', numericValue: 1 },
            { value: 'bad', numericValue: 0 },
          ],
        },
      ],
    });
    raw.evaluations = [
      {
        taskId: 't1',
        modelId: 'm1',
        modelResponse: 'Hi',
        annotations: { quality: { h: { value: 'good' } } },
      },
      {
        taskId: 't1',
        modelId: 'm2',
        modelResponse: 'Hey',
        annotations: { quality: { h: { value: 'bad' } } },
      },
    ] as any;

    const [data] = processData(raw);
    const metric = data.metrics.find((m) => m.name === 'quality');
    expect(metric?.minValue).toEqual({ value: 'bad', numericValue: 0 });
    expect(metric?.maxValue).toEqual({ value: 'good', numericValue: 1 });
  });

  it('sets minValue and maxValue for numerical metrics with range', () => {
    const [data] = processData(minimalData());
    const metric = data.metrics.find((m) => m.name === 'accuracy');
    expect(metric?.minValue).toBe(0);
    expect(metric?.maxValue).toBe(1);
  });

  // --- Multiple tasks ---

  it('handles multiple tasks independently', () => {
    const raw = minimalData();
    raw.tasks.push({
      taskId: 't2',
      taskType: 'text_generation',
      input: [{ speaker: 'user', text: 'Bye' }],
    } as any);
    // t2 only has evaluation for m1, not m2 — should be disqualified
    raw.evaluations.push({
      taskId: 't2',
      modelId: 'm1',
      modelResponse: 'Goodbye',
      annotations: { accuracy: { system: { value: 0.7 } } },
    } as any);

    const [data, disqualified] = processData(raw);
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].taskId).toBe('t1');
    expect(Object.keys(disqualified)).toContain('t2');
  });

  // --- Filters ---

  it('preserves filters from raw data', () => {
    const [data] = processData(minimalData({ filters: ['category'] }));
    expect(data.filters).toEqual(['category']);
  });

  it('omits filters when not provided', () => {
    const [data] = processData(minimalData());
    expect(data.filters).toBeUndefined();
  });

  // --- Documents ---

  it('preserves documents from raw data', () => {
    const [data] = processData(
      minimalData({
        documents: [{ documentId: 'd1', text: 'doc text' }],
      }),
    );
    expect(data.documents).toHaveLength(1);
  });
});
