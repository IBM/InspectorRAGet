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

import { memo } from 'react';
import { Select, SelectItem } from '@carbon/react';

import { Aggregator } from '@/src/types';

interface Props {
  aggregators: Aggregator[];
  onSelect: Function;
  defaultValue: Aggregator;
  warn: boolean;
  warnText?: string;
  disableDefaultValue?: boolean;
  disabledAggregators?: Aggregator[];
  disabled?: boolean;
}
export default memo(function AggregatorSelector({
  aggregators: aggregators,
  onSelect,
  defaultValue,
  warn = false,
  warnText = 'You must select an aggregator to view results.',
  disabledAggregators: disabledAggregators,
  disabled = false,
}: Props) {
  return (
    <Select
      id={'aggregator-selector'}
      labelText="Choose aggregator"
      defaultValue={defaultValue.name}
      disabled={disabled}
      warn={warn}
      warnText={warnText}
      onChange={(event) => {
        onSelect(
          aggregators.find(
            (aggregator) => aggregator.name === event.target.value,
          ),
        );
      }}
    >
      {aggregators.map((aggregator) => {
        return (
          <SelectItem
            key={`${aggregator.name}-selector`}
            value={aggregator.name}
            text={
              aggregator.displayName ? aggregator.displayName : aggregator.name
            }
            disabled={
              disabledAggregators &&
              disabledAggregators
                .map((entry) => entry.name)
                .includes(aggregator.name)
            }
          ></SelectItem>
        );
      })}
    </Select>
  );
});
