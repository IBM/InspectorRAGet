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
import {
  validate,
  evaluate,
  validateLabelExpression,
  evaluateLabels,
  EXPRESSION_OPERATORS,
} from '@/src/utilities/expressions';
import { Metric, ModelResult } from '@/src/types';

// --- Fixtures ---

const numericalMetric: Metric = {
  name: 'score',
  author: 'algorithm',
  type: 'numerical',
  range: [0, 1],
  aggregator: 'mean',
};

const categoricalMetric: Metric = {
  name: 'quality',
  author: 'human',
  type: 'categorical',
  aggregator: 'majority',
  values: [
    { value: 'bad', numericValue: 0 },
    { value: 'ok', numericValue: 1 },
    { value: 'good', numericValue: 2 },
    { value: 'excellent', numericValue: 3 },
  ],
};

function makeResult(
  taskId: string,
  modelId: string,
  aggValue: string | number,
  metric: Metric = numericalMetric,
): ModelResult {
  return {
    taskId,
    modelId,
    output: [],
    scores: {
      [metric.name]: { system: { value: aggValue } },
    },
    [`${metric.name}_agg`]: { value: aggValue, level: 'high' },
  } as any;
}

function makeResultsPerTaskPerModel(results: ModelResult[]): {
  [taskId: string]: { [modelId: string]: ModelResult };
} {
  const map: { [taskId: string]: { [modelId: string]: ModelResult } } = {};
  for (const r of results) {
    if (!map[r.taskId]) map[r.taskId] = {};
    map[r.taskId][r.modelId] = r;
  }
  return map;
}

const modelIds = ['m1', 'm2'];

// --- validate ---

describe('validate', () => {
  it('rejects an empty expression at root', () => {
    expect(validate({})).not.toBeNull();
  });

  it('accepts a valid $eq expression', () => {
    expect(validate({ m1: { $eq: 0.9 } }, modelIds)).toBeNull();
  });

  it('accepts a valid $neq expression', () => {
    expect(validate({ m1: { $neq: 0.5 } }, modelIds)).toBeNull();
  });

  it('accepts a valid $and expression', () => {
    expect(
      validate(
        { $and: [{ m1: { $gt: 0.8 } }, { m2: { $lt: 0.5 } }] },
        modelIds,
      ),
    ).toBeNull();
  });

  it('accepts a valid $or expression', () => {
    expect(
      validate({ $or: [{ m1: { $eq: 0.9 } }, { m2: { $eq: 0.8 } }] }, modelIds),
    ).toBeNull();
  });

  it('rejects unknown model ID', () => {
    expect(validate({ unknown: { $eq: 0.9 } }, modelIds)).not.toBeNull();
  });

  it('rejects $and with empty array', () => {
    expect(validate({ $and: [] }, modelIds)).not.toBeNull();
  });

  it('rejects logical operator directly under model ID', () => {
    expect(validate({ m1: { $and: [] } }, modelIds)).not.toBeNull();
  });

  // --- $in ---

  it('accepts a valid $in expression', () => {
    expect(
      validate({ m1: { $in: ['good', 'excellent'] } }, modelIds),
    ).toBeNull();
  });

  it('accepts a valid $nin expression', () => {
    expect(validate({ m1: { $nin: ['bad'] } }, modelIds)).toBeNull();
  });

  it('accepts $in with numeric values', () => {
    expect(validate({ m1: { $in: [0.8, 0.9] } }, modelIds)).toBeNull();
  });

  it('rejects $in with empty array', () => {
    expect(validate({ m1: { $in: [] } }, modelIds)).not.toBeNull();
  });

  it('rejects $nin with empty array', () => {
    expect(validate({ m1: { $nin: [] } }, modelIds)).not.toBeNull();
  });

  it('rejects $in with non-primitive array elements', () => {
    expect(
      validate({ m1: { $in: [{ nested: true }] } }, modelIds),
    ).not.toBeNull();
  });

  it('rejects $in without a preceding model ID', () => {
    expect(validate({ $in: ['good'] }, modelIds)).not.toBeNull();
  });

  it('rejects $nin with a non-array value', () => {
    expect(validate({ m1: { $nin: 'bad' } }, modelIds)).not.toBeNull();
  });
});

// --- evaluate: existing operators ---

describe('evaluate — existing operators', () => {
  it('matches tasks where model value satisfies $eq', () => {
    const results = [
      makeResult('t1', 'm1', 0.9),
      makeResult('t1', 'm2', 0.7),
      makeResult('t2', 'm1', 0.5),
      makeResult('t2', 'm2', 0.5),
    ];
    const map = makeResultsPerTaskPerModel(results);
    const matched = evaluate(map, { m1: { $eq: 0.9 } }, numericalMetric);
    const taskIds = matched.map((r) => r.taskId);
    expect(taskIds).toContain('t1');
    expect(taskIds).not.toContain('t2');
  });

  it('$and returns intersection of matched tasks', () => {
    const results = [
      makeResult('t1', 'm1', 0.9),
      makeResult('t1', 'm2', 0.8),
      makeResult('t2', 'm1', 0.9),
      makeResult('t2', 'm2', 0.3),
    ];
    const map = makeResultsPerTaskPerModel(results);
    const matched = evaluate(
      map,
      { $and: [{ m1: { $eq: 0.9 } }, { m2: { $gt: 0.7 } }] },
      numericalMetric,
    );
    const taskIds = new Set(matched.map((r) => r.taskId));
    // t1 satisfies both; t2 fails m2 condition
    expect(taskIds.has('t1')).toBe(true);
    expect(taskIds.has('t2')).toBe(false);
  });

  it('$or returns union of matched tasks', () => {
    const results = [
      makeResult('t1', 'm1', 0.9),
      makeResult('t1', 'm2', 0.3),
      makeResult('t2', 'm1', 0.3),
      makeResult('t2', 'm2', 0.8),
    ];
    const map = makeResultsPerTaskPerModel(results);
    const matched = evaluate(
      map,
      { $or: [{ m1: { $gt: 0.8 } }, { m2: { $gt: 0.7 } }] },
      numericalMetric,
    );
    const taskIds = new Set(matched.map((r) => r.taskId));
    expect(taskIds.has('t1')).toBe(true);
    expect(taskIds.has('t2')).toBe(true);
  });
});

// --- evaluate: $in / $nin ---

describe('evaluate — $in and $nin', () => {
  it('$in matches tasks where model value is in the set', () => {
    const results = [
      makeResult('t1', 'm1', 2, categoricalMetric), // 'good'
      makeResult('t1', 'm2', 1, categoricalMetric), // 'ok'
      makeResult('t2', 'm1', 0, categoricalMetric), // 'bad'
      makeResult('t2', 'm2', 3, categoricalMetric), // 'excellent'
    ];
    const map = makeResultsPerTaskPerModel(results);
    // $in: ['good', 'excellent'] — numeric 2 and 3
    const matched = evaluate(
      map,
      { m1: { $in: ['good', 'excellent'] } },
      categoricalMetric,
    );
    const taskIds = new Set(matched.map((r) => r.taskId));
    expect(taskIds.has('t1')).toBe(true); // m1 = 'good' (2)
    expect(taskIds.has('t2')).toBe(false); // m1 = 'bad' (0)
  });

  it('$nin excludes tasks where model value is in the set', () => {
    const results = [
      makeResult('t1', 'm1', 0, categoricalMetric), // 'bad'
      makeResult('t1', 'm2', 2, categoricalMetric),
      makeResult('t2', 'm1', 2, categoricalMetric), // 'good'
      makeResult('t2', 'm2', 2, categoricalMetric),
    ];
    const map = makeResultsPerTaskPerModel(results);
    const matched = evaluate(map, { m1: { $nin: ['bad'] } }, categoricalMetric);
    const taskIds = new Set(matched.map((r) => r.taskId));
    expect(taskIds.has('t1')).toBe(false); // m1 = 'bad' excluded
    expect(taskIds.has('t2')).toBe(true); // m1 = 'good' passes
  });

  it('$in works with numeric values directly', () => {
    const results = [
      makeResult('t1', 'm1', 0.8),
      makeResult('t1', 'm2', 0.5),
      makeResult('t2', 'm1', 0.5),
      makeResult('t2', 'm2', 0.5),
    ];
    const map = makeResultsPerTaskPerModel(results);
    const matched = evaluate(map, { m1: { $in: [0.8, 0.9] } }, numericalMetric);
    const taskIds = new Set(matched.map((r) => r.taskId));
    expect(taskIds.has('t1')).toBe(true);
    expect(taskIds.has('t2')).toBe(false);
  });

  it('$in with a single-value array', () => {
    const results = [makeResult('t1', 'm1', 0.8), makeResult('t1', 'm2', 0.5)];
    const map = makeResultsPerTaskPerModel(results);
    const matched = evaluate(map, { m1: { $in: [0.8] } }, numericalMetric);
    expect(matched.map((r) => r.taskId)).toContain('t1');
  });

  it('$in combined with $and', () => {
    const results = [
      makeResult('t1', 'm1', 2, categoricalMetric), // 'good'
      makeResult('t1', 'm2', 3, categoricalMetric), // 'excellent'
      makeResult('t2', 'm1', 2, categoricalMetric), // 'good'
      makeResult('t2', 'm2', 0, categoricalMetric), // 'bad'
    ];
    const map = makeResultsPerTaskPerModel(results);
    const matched = evaluate(
      map,
      {
        $and: [
          { m1: { $in: ['good', 'excellent'] } },
          { m2: { $nin: ['bad'] } },
        ],
      },
      categoricalMetric,
    );
    const taskIds = new Set(matched.map((r) => r.taskId));
    // t1: m1=good (pass), m2=excellent (not bad, pass) => match
    // t2: m1=good (pass), m2=bad (fail $nin) => no match
    expect(taskIds.has('t1')).toBe(true);
    expect(taskIds.has('t2')).toBe(false);
  });
});

// --- validateLabelExpression ---

describe('validateLabelExpression', () => {
  it('accepts $eq', () => {
    expect(
      validateLabelExpression({ m1: { $eq: 'force_terminated' } }, ['m1']),
    ).toBeNull();
  });

  it('accepts $neq', () => {
    expect(validateLabelExpression({ m1: { $neq: 'N/A' } }, ['m1'])).toBeNull();
  });

  it('accepts $in', () => {
    expect(
      validateLabelExpression({ m1: { $in: ['force_terminated', 'N/A'] } }, [
        'm1',
      ]),
    ).toBeNull();
  });

  it('accepts $nin', () => {
    expect(
      validateLabelExpression({ m1: { $nin: ['N/A'] } }, ['m1']),
    ).toBeNull();
  });

  it('accepts $and', () => {
    expect(
      validateLabelExpression(
        { $and: [{ m1: { $eq: 'foo' } }, { m2: { $neq: 'bar' } }] },
        ['m1', 'm2'],
      ),
    ).toBeNull();
  });

  it('accepts $or', () => {
    expect(
      validateLabelExpression(
        { $or: [{ m1: { $eq: 'foo' } }, { m1: { $eq: 'bar' } }] },
        ['m1'],
      ),
    ).toBeNull();
  });

  it('rejects $gt', () => {
    expect(
      validateLabelExpression({ m1: { $gt: 0.8 } }, ['m1']),
    ).not.toBeNull();
  });

  it('rejects $gte', () => {
    expect(
      validateLabelExpression({ m1: { $gte: 0.8 } }, ['m1']),
    ).not.toBeNull();
  });

  it('rejects $lt', () => {
    expect(
      validateLabelExpression({ m1: { $lt: 0.5 } }, ['m1']),
    ).not.toBeNull();
  });

  it('rejects $lte', () => {
    expect(
      validateLabelExpression({ m1: { $lte: 0.5 } }, ['m1']),
    ).not.toBeNull();
  });

  it('rejects empty expression at root', () => {
    expect(validateLabelExpression({})).not.toBeNull();
  });

  it('rejects unknown model ID', () => {
    expect(
      validateLabelExpression({ unknown: { $eq: 'x' } }, ['m1']),
    ).not.toBeNull();
  });

  it('rejects $in with empty array', () => {
    expect(validateLabelExpression({ m1: { $in: [] } }, ['m1'])).not.toBeNull();
  });
});

// --- evaluateLabels ---

// Helper to build a labelSlice from a plain object
function makeSlice(
  data: Record<string, Record<string, string>>,
): Map<string, Map<string, string>> {
  return new Map(
    Object.entries(data).map(([taskId, modelMap]) => [
      taskId,
      new Map(Object.entries(modelMap)),
    ]),
  );
}

describe('evaluateLabels', () => {
  it('$eq matches tasks where the model has that value', () => {
    const slice = makeSlice({
      t1: { m1: 'force_terminated', m2: 'N/A' },
      t2: { m1: 'N/A', m2: 'force_terminated' },
    });
    const result = evaluateLabels(slice, { m1: { $eq: 'force_terminated' } });
    expect(result.has('t1')).toBe(true);
    expect(result.has('t2')).toBe(false);
  });

  it('$neq excludes tasks where the model has that value', () => {
    const slice = makeSlice({
      t1: { m1: 'force_terminated' },
      t2: { m1: 'decoder_failed' },
    });
    const result = evaluateLabels(slice, { m1: { $neq: 'force_terminated' } });
    expect(result.has('t1')).toBe(false);
    expect(result.has('t2')).toBe(true);
  });

  it('$in matches tasks where model value is in the set', () => {
    const slice = makeSlice({
      t1: { m1: 'force_terminated' },
      t2: { m1: 'decoder_failed' },
      t3: { m1: 'N/A' },
    });
    const result = evaluateLabels(slice, {
      m1: { $in: ['force_terminated', 'decoder_failed'] },
    });
    expect(result.has('t1')).toBe(true);
    expect(result.has('t2')).toBe(true);
    expect(result.has('t3')).toBe(false);
  });

  it('$nin excludes tasks where model value is in the set', () => {
    const slice = makeSlice({
      t1: { m1: 'force_terminated' },
      t2: { m1: 'N/A' },
    });
    const result = evaluateLabels(slice, {
      m1: { $nin: ['force_terminated'] },
    });
    expect(result.has('t1')).toBe(false);
    expect(result.has('t2')).toBe(true);
  });

  it('N/A is matched literally by $eq', () => {
    const slice = makeSlice({
      t1: { m1: 'N/A' },
      t2: { m1: 'force_terminated' },
    });
    const result = evaluateLabels(slice, { m1: { $eq: 'N/A' } });
    expect(result.has('t1')).toBe(true);
    expect(result.has('t2')).toBe(false);
  });

  it('missing model entry defaults to N/A', () => {
    // t1 has no entry for m2 — should default to N/A
    const slice = makeSlice({
      t1: { m1: 'force_terminated' },
    });
    const result = evaluateLabels(slice, { m2: { $eq: 'N/A' } });
    expect(result.has('t1')).toBe(true);
  });

  it('$and returns intersection', () => {
    const slice = makeSlice({
      t1: { m1: 'force_terminated', m2: 'decoder_failed' },
      t2: { m1: 'force_terminated', m2: 'N/A' },
      t3: { m1: 'N/A', m2: 'decoder_failed' },
    });
    const result = evaluateLabels(slice, {
      $and: [
        { m1: { $eq: 'force_terminated' } },
        { m2: { $eq: 'decoder_failed' } },
      ],
    });
    expect(result.has('t1')).toBe(true);
    expect(result.has('t2')).toBe(false);
    expect(result.has('t3')).toBe(false);
  });

  it('$or returns union', () => {
    const slice = makeSlice({
      t1: { m1: 'force_terminated', m2: 'N/A' },
      t2: { m1: 'N/A', m2: 'decoder_failed' },
      t3: { m1: 'N/A', m2: 'N/A' },
    });
    const result = evaluateLabels(slice, {
      $or: [
        { m1: { $eq: 'force_terminated' } },
        { m2: { $eq: 'decoder_failed' } },
      ],
    });
    expect(result.has('t1')).toBe(true);
    expect(result.has('t2')).toBe(true);
    expect(result.has('t3')).toBe(false);
  });

  it('primitive shorthand is treated as $eq', () => {
    const slice = makeSlice({
      t1: { m1: 'force_terminated' },
      t2: { m1: 'N/A' },
    });
    const result = evaluateLabels(slice, { m1: 'force_terminated' });
    expect(result.has('t1')).toBe(true);
    expect(result.has('t2')).toBe(false);
  });

  it('multi-model condition: both models must satisfy', () => {
    const slice = makeSlice({
      t1: { m1: 'force_terminated', m2: 'force_terminated' },
      t2: { m1: 'force_terminated', m2: 'N/A' },
    });
    const result = evaluateLabels(slice, {
      m1: { $eq: 'force_terminated' },
      m2: { $eq: 'force_terminated' },
    });
    expect(result.has('t1')).toBe(true);
    expect(result.has('t2')).toBe(false);
  });
});
