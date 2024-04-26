/**
 *
 * Copyright 2023-2024 InspectorRAGet Team
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
import { Select, SelectItem, SelectItemGroup } from '@carbon/react';

import { Metric } from '@/src/types';
import { extractMetricDisplayName } from '@/src/utilities/metrics';

interface Props {
  metrics: Metric[];
  onSelect: Function;
  warn: boolean;
  warnText?: string;
  defaultValue?: string;
  disableDefaultValue?: boolean;
  disabledMetrics?: Metric[];
  disabled?: boolean;
}
export default memo(function MetricSelector({
  metrics,
  onSelect,
  warn = false,
  warnText = 'You must select a single metric to view tasks.',
  defaultValue = 'all',
  disableDefaultValue = false,
  disabledMetrics,
  disabled = false,
}: Props) {
  const metricTypes = new Set(metrics.map((metric) => metric.type));

  return (
    <Select
      id={'metric-selector'}
      labelText="Choose metric"
      disabled={disabled}
      defaultValue={defaultValue}
      warn={warn}
      warnText={warnText}
      onChange={(event) => {
        onSelect(
          event.target.value !== defaultValue
            ? metrics.find((metric) => metric.name === event.target.value)
            : undefined,
        );
      }}
    >
      <SelectItem
        key={'default-selector'}
        text={
          defaultValue.charAt(0).toUpperCase() +
          defaultValue.slice(1).toLowerCase()
        }
        value={defaultValue}
        disabled={disableDefaultValue}
      />
      {metricTypes.size > 1 ? (
        <>
          <SelectItemGroup key={'human-metric-selectors'} label={'Human'}>
            {metrics
              .filter((metric) => metric.author === 'human')
              .map((metric) => {
                return (
                  <SelectItem
                    key={`${metric.name}-selector`}
                    value={metric.name}
                    text={extractMetricDisplayName(metric)}
                    disabled={
                      disabledMetrics &&
                      disabledMetrics
                        .map((entry) => entry.name)
                        .includes(metric.name)
                    }
                  ></SelectItem>
                );
              })}
          </SelectItemGroup>
          <SelectItemGroup
            key={'algorithmic-metric-selectors'}
            label={'Algorithmic'}
          >
            {metrics
              .filter((metric) => metric.author === 'algorithm')
              .map((metric) => {
                return (
                  <SelectItem
                    key={`${metric.name}-selector`}
                    value={metric.name}
                    text={extractMetricDisplayName(metric)}
                    disabled={
                      disabledMetrics &&
                      disabledMetrics
                        .map((entry) => entry.name)
                        .includes(metric.name)
                    }
                  ></SelectItem>
                );
              })}
          </SelectItemGroup>
        </>
      ) : (
        metrics.map((metric) => {
          return (
            <SelectItem
              key={`${metric.name}-selector`}
              value={metric.name}
              text={extractMetricDisplayName(metric)}
              disabled={
                disabledMetrics &&
                disabledMetrics.map((entry) => entry.name).includes(metric.name)
              }
            ></SelectItem>
          );
        })
      )}
    </Select>
  );
});
