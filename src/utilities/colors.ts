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

import { Model } from '@/src/types';

export function getModelColorPalette(
  models: Model[],
): [{ [key: string]: string }, string[]] {
  const modelColors: { [key: string]: string } = {};
  const modelOrder: string[] = [];

  const palette = [
    '#6929c4',
    '#1192e8',
    '#005d5d',
    '#9f1853',
    '#fa4d56',
    '#570408',
    '#198038',
    '#002d9c',
    '#ee538b',
    '#b28600',
    '#009d9a',
    '#012749',
    '#8a3800',
    '#a56eff',
  ];

  for (const [i, entry] of models.entries()) {
    modelColors[entry.name] = palette[i];
    modelOrder.push(entry.name);
  }

  return [modelColors, modelOrder];
}

export function getAgreementLevelColorPalette() {
  return {
    No: '#da1e28',
    Low: '#ff832b',
    High: '#f1c21b',
    Absolute: '#0e6027',
  };
}

export function getVotingPatternColorPalette() {
  return {
    Unanimous: '#0e6027',
    Majority: '#42be65',
    'Dissidents (minor)': '#f1c21b',
    'Dissidents (major)': '#ff832b',
    Divided: '#da1e28',
  };
}
