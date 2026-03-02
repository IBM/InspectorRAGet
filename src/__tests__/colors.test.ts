import { describe, it, expect } from 'vitest';
import {
  getModelColorPalette,
  getAgreementLevelColorPalette,
  getVotingPatternColorPalette,
} from '@/src/utilities/colors';
import { Model } from '@/src/types';

// --- getModelColorPalette ---

describe('getModelColorPalette', () => {
  it('returns empty map and order for empty models array', () => {
    const [colors, order] = getModelColorPalette([]);
    expect(colors).toEqual({});
    expect(order).toEqual([]);
  });

  it('assigns colors to models in order', () => {
    const models: Model[] = [
      { modelId: 'm1', name: 'Model A', owner: 'o1' },
      { modelId: 'm2', name: 'Model B', owner: 'o2' },
    ];
    const [colors, order] = getModelColorPalette(models);
    expect(Object.keys(colors)).toHaveLength(2);
    expect(colors['Model A']).toBeDefined();
    expect(colors['Model B']).toBeDefined();
    expect(colors['Model A']).not.toBe(colors['Model B']);
    expect(order).toEqual(['Model A', 'Model B']);
  });

  it('returns hex color codes', () => {
    const models: Model[] = [{ modelId: 'm1', name: 'Model A', owner: 'o1' }];
    const [colors] = getModelColorPalette(models);
    expect(colors['Model A']).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('preserves model order', () => {
    const models: Model[] = [
      { modelId: 'm1', name: 'Zeta', owner: 'o1' },
      { modelId: 'm2', name: 'Alpha', owner: 'o2' },
      { modelId: 'm3', name: 'Mu', owner: 'o3' },
    ];
    const [, order] = getModelColorPalette(models);
    expect(order).toEqual(['Zeta', 'Alpha', 'Mu']);
  });

  it('handles up to 14 models (palette size)', () => {
    const models: Model[] = Array.from({ length: 14 }, (_, i) => ({
      modelId: `m${i}`,
      name: `Model ${i}`,
      owner: 'owner',
    }));
    const [colors, order] = getModelColorPalette(models);
    expect(Object.keys(colors)).toHaveLength(14);
    expect(order).toHaveLength(14);
    // All colors should be unique
    const uniqueColors = new Set(Object.values(colors));
    expect(uniqueColors.size).toBe(14);
  });
});

// --- getAgreementLevelColorPalette ---

describe('getAgreementLevelColorPalette', () => {
  it('returns palette with all four agreement levels', () => {
    const palette = getAgreementLevelColorPalette();
    expect(Object.keys(palette)).toEqual(['No', 'Low', 'High', 'Absolute']);
  });

  it('returns hex color codes', () => {
    const palette = getAgreementLevelColorPalette();
    for (const color of Object.values(palette)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

// --- getVotingPatternColorPalette ---

describe('getVotingPatternColorPalette', () => {
  it('returns palette with all five voting patterns', () => {
    const palette = getVotingPatternColorPalette();
    expect(Object.keys(palette)).toEqual([
      'Unanimous',
      'Majority',
      'Dissidents (minor)',
      'Dissidents (major)',
      'Divided',
    ]);
  });

  it('returns hex color codes', () => {
    const palette = getVotingPatternColorPalette();
    for (const color of Object.values(palette)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
