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

import cx from 'classnames';
import { useState } from 'react';

import { FilterableMultiSelect, Tag, Tooltip, Button } from '@carbon/react';
import { ChevronUp, ChevronDown, SubtractAlt } from '@carbon/icons-react';

import { Metric } from '@/src/types';
import { extractMetricDisplayName } from '@/src/utilities/metrics';

import classes from './FilterMetrics.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  metrics: Metric[];
  hiddenMetrics: Metric[];
  setHiddenMetrics: Function;
}

export default function FilterMetrics({
  metrics,
  hiddenMetrics: ignoredMetrics,
  setHiddenMetrics: setIgnoredMetrics,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [showIgnoreMetrics, setShowIgnoreMetrics] = useState<boolean>(true);

  // Step 2: Render
  return (
    <>
      <Tooltip
        label={'Click to hide certain metrics'}
        align={'right'}
        className={classes.filterMetricsBtnTooltip}
      >
        <Button
          id={'PerformanceOverview-metrics--Ignore'}
          className={classes.filterMetricsBtn}
          kind={'ghost'}
          size={'sm'}
          onClick={() => {
            setShowIgnoreMetrics(!showIgnoreMetrics);
          }}
        >
          <div className={classes.filterMetricsBtnElements}>
            {showIgnoreMetrics ? (
              <ChevronUp size={24} />
            ) : (
              <ChevronDown size={24} />
            )}
            <div className={classes.filterMetricsBtnCaptionElements}>
              <h5>Hide Metrics</h5>
              <SubtractAlt />
            </div>
          </div>
        </Button>
      </Tooltip>
      {showIgnoreMetrics ? (
        <div
          className={cx(
            classes.container,
            showIgnoreMetrics && classes.visible,
          )}
        >
          <FilterableMultiSelect
            id={'metrics--limiter'}
            items={metrics}
            itemToString={(item) =>
              item.displayName ? item.displayName : item.name
            }
            onChange={(event) => {
              setIgnoredMetrics(event.selectedItems);
            }}
          ></FilterableMultiSelect>
          <div>
            {ignoredMetrics.map((metric) => {
              return (
                <Tag type={'cool-gray'} key={`filtered-metric--` + metric.name}>
                  {extractMetricDisplayName(metric)}
                </Tag>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
