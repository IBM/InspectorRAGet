import { describe, it, expect } from 'vitest';
import { calculateDuration, castDurationToString } from '@/src/utilities/time';

// --- calculateDuration ---

describe('calculateDuration', () => {
  it('returns all undefineds when endTimestamp is missing', () => {
    expect(calculateDuration(undefined, 1000)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('returns all undefineds when startTimestamp is missing', () => {
    expect(calculateDuration(1000, undefined)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('returns all undefineds when both timestamps are missing', () => {
    expect(calculateDuration(undefined, undefined)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('calculates zero duration when timestamps are equal', () => {
    expect(calculateDuration(5000, 5000)).toEqual([0, 0, 0, 0]);
  });

  it('calculates seconds correctly', () => {
    // 5 seconds = 5000ms
    const start = 1000;
    const end = 6000;
    expect(calculateDuration(end, start)).toEqual([0, 0, 0, 5]);
  });

  it('calculates minutes correctly', () => {
    // 2 minutes 30 seconds = 150,000ms
    const start = 1000;
    const end = 151000;
    expect(calculateDuration(end, start)).toEqual([0, 0, 2, 30]);
  });

  it('calculates hours correctly', () => {
    // 1 hour 15 minutes = 4,500,000ms
    const start = 1000;
    const end = 4501000;
    expect(calculateDuration(end, start)).toEqual([0, 1, 15, 0]);
  });

  it('calculates days correctly', () => {
    // 2 days 3 hours 4 minutes 5 seconds
    const start = 1000;
    const ms =
      2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000 + 4 * 60 * 1000 + 5 * 1000;
    expect(calculateDuration(ms + start, start)).toEqual([2, 3, 4, 5]);
  });

  it('returns all undefineds when endTimestamp is 0 (falsy)', () => {
    // The function uses !endTimestamp, so 0 is treated as falsy
    expect(calculateDuration(0, 1000)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('returns all undefineds when startTimestamp is 0 (falsy)', () => {
    // The function uses !startTimestamp, so 0 is treated as falsy
    expect(calculateDuration(1000, 0)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});

// --- castDurationToString ---

describe('castDurationToString', () => {
  it('handles zero duration', () => {
    expect(castDurationToString(0)).toEqual([0, 0, 0, 0]);
  });

  it('calculates seconds correctly', () => {
    expect(castDurationToString(45)).toEqual([0, 0, 0, 45]);
  });

  it('calculates minutes and seconds', () => {
    // 2 minutes 30 seconds = 150 seconds
    expect(castDurationToString(150)).toEqual([0, 0, 2, 30]);
  });

  it('calculates hours, minutes, and seconds', () => {
    // 1 hour 15 minutes 10 seconds = 4510 seconds
    expect(castDurationToString(4510)).toEqual([0, 1, 15, 10]);
  });

  it('calculates days, hours, minutes, and seconds', () => {
    // 1 day 2 hours 3 minutes 4 seconds
    const seconds = 1 * 86400 + 2 * 3600 + 3 * 60 + 4;
    expect(castDurationToString(seconds)).toEqual([1, 2, 3, 4]);
  });

  it('handles exactly one day', () => {
    expect(castDurationToString(86400)).toEqual([1, 0, 0, 0]);
  });

  it('handles exactly one hour', () => {
    expect(castDurationToString(3600)).toEqual([0, 1, 0, 0]);
  });

  it('handles exactly one minute', () => {
    expect(castDurationToString(60)).toEqual([0, 0, 1, 0]);
  });
});
