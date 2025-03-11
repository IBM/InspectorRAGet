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

import cx from 'classnames';
import { useState } from 'react';

import { FilterableMultiSelect, Tag, Tooltip, Button } from '@carbon/react';
import { ChevronUp, ChevronDown, SubtractAlt } from '@carbon/icons-react';

import { Metric, Model } from '@/src/types';
import { extractMetricDisplayName } from '@/src/utilities/metrics';

import classes from './Hide.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  models: Model[];
  metrics: Metric[];
  hiddenModels: Model[];
  hiddenMetrics: Metric[];
  setHiddenModels: Function;
  setHiddenMetrics: Function;
}

export default function HidePanel({
  models,
  metrics,
  hiddenModels: ignoredModels,
  hiddenMetrics: ignoredMetrics,
  setHiddenModels: setIgnoredModels,
  setHiddenMetrics: setIgnoredMetrics,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [show, setShow] = useState<boolean>(true);

  // Step 2: Render
  return (
    <>
      <Tooltip
        label={'Click to hide certain models & metrics'}
        align={'right'}
        className={classes.hideBtnTooltip}
      >
        <Button
          id={'PerformanceOverview-hide--Ignore'}
          className={classes.hideBtn}
          kind={'ghost'}
          size={'sm'}
          onClick={() => {
            setShow(!show);
          }}
        >
          <div className={classes.hideBtnElements}>
            {show ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
            <div className={classes.hideBtnCaptionElements}>
              <h5>Hide Models & Metrics</h5>
              <SubtractAlt />
            </div>
          </div>
        </Button>
      </Tooltip>
      {show ? (
        <div className={cx(classes.container, show && classes.visible)}>
          <div
            key={'models-limiter--' + `${ignoredModels === models}`}
            className={classes.selector}
          >
            <FilterableMultiSelect
              id={'model--limiter'}
              titleText={
                <div className={classes.selectorLabel}>
                  <span>Models</span>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => setIgnoredModels(models)}
                  >
                    select all
                  </Button>
                </div>
              }
              items={models}
              initialSelectedItems={ignoredModels}
              itemToString={(item) => (item.name ? item.name : item.modelId)}
              onChange={(event) => {
                setIgnoredModels(event.selectedItems);
              }}
            ></FilterableMultiSelect>
            <div>
              {ignoredModels.map((model) => {
                return (
                  <Tag
                    type={'cool-gray'}
                    key={`filtered-model--` + model.modelId}
                  >
                    {model.name ? model.name : model.modelId}
                  </Tag>
                );
              })}
            </div>
          </div>
          <div
            key={'metrics-limiter--' + `${ignoredMetrics === metrics}`}
            className={classes.selector}
          >
            <FilterableMultiSelect
              id={'metrics--limiter'}
              titleText={
                <div className={classes.selectorLabel}>
                  <span>Metrics</span>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => setIgnoredMetrics(metrics)}
                  >
                    select all
                  </Button>
                </div>
              }
              items={metrics}
              initialSelectedItems={ignoredMetrics}
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
                  <Tag
                    type={'cool-gray'}
                    key={`filtered-metric--` + metric.name}
                  >
                    {extractMetricDisplayName(metric)}
                  </Tag>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
