import { describe, it, expect } from 'vitest';
import {
  camelCaseKeys,
  snakeCaseKeys,
  areObjectsIntersecting,
} from '@/src/utilities/objects';

// --- camelCaseKeys ---

describe('camelCaseKeys', () => {
  it('converts default snake_case keys to camelCase', () => {
    const input = { task_id: '1', model_id: 'm1', other_key: 'keep' };
    const result = camelCaseKeys(input);
    expect(result).toEqual({ taskId: '1', modelId: 'm1', other_key: 'keep' });
  });

  it('leaves non-listed keys untouched', () => {
    const input = { foo_bar: 'value', task_id: 'x' };
    const result = camelCaseKeys(input);
    expect(result).toHaveProperty('foo_bar', 'value');
    expect(result).toHaveProperty('taskId', 'x');
  });

  it('handles nested objects recursively', () => {
    const input = { task_id: '1', nested: { model_id: 'm1' } };
    const result = camelCaseKeys(input);
    expect(result).toEqual({ taskId: '1', nested: { modelId: 'm1' } });
  });

  it('handles arrays of objects', () => {
    const input = [{ task_id: '1' }, { task_id: '2' }];
    const result = camelCaseKeys(input as any);
    expect(result).toEqual([{ taskId: '1' }, { taskId: '2' }]);
  });

  it('returns primitives unchanged', () => {
    expect(camelCaseKeys('hello' as any)).toBe('hello');
    expect(camelCaseKeys(42 as any)).toBe(42);
    expect(camelCaseKeys(null as any)).toBeNull();
  });

  it('uses custom keys list when provided', () => {
    const input = { foo_bar: 'val', task_id: 'keep' };
    const result = camelCaseKeys(input, ['foo_bar']);
    expect(result).toHaveProperty('fooBar', 'val');
    expect(result).toHaveProperty('task_id', 'keep');
  });

  it('handles empty objects', () => {
    expect(camelCaseKeys({})).toEqual({});
  });

  it('handles empty arrays', () => {
    expect(camelCaseKeys([] as any)).toEqual([]);
  });

  it('converts all default keys', () => {
    const input = {
      task_id: 'a',
      model_id: 'b',
      model_response: 'c',
      display_value: 'd',
      numeric_value: 'e',
      min_value: 'f',
      max_value: 'g',
      task_type: 'h',
      num_tasks: 'i',
      start_timestamp: 'j',
      end_timestamp: 'k',
      document_id: 'l',
      display_name: 'm',
    };
    const result = camelCaseKeys(input);
    expect(result).toEqual({
      taskId: 'a',
      modelId: 'b',
      modelResponse: 'c',
      displayValue: 'd',
      numericValue: 'e',
      minValue: 'f',
      maxValue: 'g',
      taskType: 'h',
      numTasks: 'i',
      startTimestamp: 'j',
      endTimestamp: 'k',
      documentId: 'l',
      displayName: 'm',
    });
  });
});

// --- snakeCaseKeys ---

describe('snakeCaseKeys', () => {
  it('converts default camelCase keys to snake_case', () => {
    const input = { taskId: '1', modelId: 'm1', otherKey: 'keep' };
    const result = snakeCaseKeys(input);
    expect(result).toEqual({ task_id: '1', model_id: 'm1', otherKey: 'keep' });
  });

  it('handles nested objects recursively', () => {
    const input = { taskId: '1', nested: { modelId: 'm1' } };
    const result = snakeCaseKeys(input);
    expect(result).toEqual({ task_id: '1', nested: { model_id: 'm1' } });
  });

  it('handles arrays of objects', () => {
    const input = [{ taskId: '1' }, { taskId: '2' }];
    const result = snakeCaseKeys(input as any);
    expect(result).toEqual([{ task_id: '1' }, { task_id: '2' }]);
  });

  it('returns primitives unchanged', () => {
    expect(snakeCaseKeys('hello' as any)).toBe('hello');
    expect(snakeCaseKeys(42 as any)).toBe(42);
  });

  it('uses custom keys list when provided', () => {
    const input = { fooBar: 'val', taskId: 'keep' };
    const result = snakeCaseKeys(input, ['fooBar']);
    expect(result).toHaveProperty('foo_bar', 'val');
    expect(result).toHaveProperty('taskId', 'keep');
  });
});

// --- areObjectsIntersecting ---

describe('areObjectsIntersecting', () => {
  it('returns true when objects share a key-value pair', () => {
    const a = { color: 'red' };
    const b = { color: 'red' };
    expect(areObjectsIntersecting(a, b)).toBe(true);
  });

  it('returns false when values differ for same key', () => {
    const a = { color: 'red' };
    const b = { color: 'blue' };
    expect(areObjectsIntersecting(a, b)).toBe(false);
  });

  it('treats "all" as matching any value', () => {
    const a = { color: 'all' };
    const b = { color: 'red' };
    expect(areObjectsIntersecting(a, b)).toBe(true);
  });

  it('"all" matches even when key is missing from b', () => {
    const a = { color: 'all' };
    const b = { size: 'large' };
    expect(areObjectsIntersecting(a, b)).toBe(true);
  });

  it('returns false when a has a non-empty value but key is missing in b', () => {
    const a = { color: 'red' };
    const b = { size: 'large' };
    expect(areObjectsIntersecting(a, b)).toBe(false);
  });

  it('handles array values with intersection', () => {
    const a = { color: ['red', 'blue'] };
    const b = { color: ['blue', 'green'] };
    expect(areObjectsIntersecting(a, b)).toBe(true);
  });

  it('handles array values without intersection', () => {
    const a = { color: ['red', 'blue'] };
    const b = { color: ['green', 'yellow'] };
    expect(areObjectsIntersecting(a, b)).toBe(false);
  });

  it('requires all keys in a to intersect (AND logic)', () => {
    const a = { color: 'red', size: 'large' };
    const b = { color: 'red', size: 'small' };
    expect(areObjectsIntersecting(a, b)).toBe(false);
  });

  it('returns true when all keys in a intersect with b', () => {
    const a = { color: 'red', size: 'large' };
    const b = { color: 'red', size: 'large' };
    expect(areObjectsIntersecting(a, b)).toBe(true);
  });

  it('returns false when a has non-empty value and b value is empty', () => {
    const a = { color: 'red' };
    const b = { color: '' };
    expect(areObjectsIntersecting(a, b)).toBe(false);
  });
});
