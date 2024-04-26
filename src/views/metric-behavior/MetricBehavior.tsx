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

import { isEmpty } from 'lodash';
import { useState, useMemo, useEffect, memo } from 'react';
import { WarningAlt } from '@carbon/icons-react';
import { HeatmapChart } from '@carbon/charts-react';
import { ColorLegendType, ScaleTypes } from '@carbon/charts';

import { useTheme } from '@/src/theme';
import { TaskEvaluation, Model, Metric } from '@/src/types';
import {
  extractMetricDisplayValue,
  extractMetricDisplayName,
  bin,
  compareMetricAggregatedValues,
  castToNumber,
} from '@/src/utilities/metrics';
import { spearman } from '@/src/utilities/correlation';
import { areObjectsIntersecting } from '@/src/utilities/objects';

import Filters from '@/src/components/filters/Filters';
import MetricSelector from '@/src/components/selectors/MetricSelector';

import '@carbon/charts-react/styles.css';
import classes from './MetricBehavior.module.scss';

import { FilterableMultiSelect, Tag } from '@carbon/react';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  evaluationsPerMetric: { [key: string]: TaskEvaluation[] };
  models: Model[];
  metrics: Metric[];
  filters: { [key: string]: string[] };
}

// ===================================================================================
//                               COMPUTE FUNCTIONS
// ===================================================================================
/**
 * Calculate correlation for every metric against every other metric
 * @param evaluationsPerMetric
 * @param metrics
 * @returns
 */
function calculateCorrelation(
  evaluationsPerMetric: {
    [key: string]: TaskEvaluation[];
  },
  metrics: Metric[],
) {
  // Step 1: Prepare value arrays for metrics pair
  let valueArrays: {
    [key: string]: { [key: string]: any[] };
  } = {};
  Object.keys(evaluationsPerMetric).forEach((metric1: string) => {
    valueArrays[metric1] = {};
    Object.keys(evaluationsPerMetric).forEach(
      (metric2: string) => (valueArrays[metric1][metric2] = []),
    );
  });

  // Step2: Build evaluations map per metric for faster access later
  const evaluationsMapPerMetric = new Map();
  for (const [metric, evaluations] of Object.entries(evaluationsPerMetric)) {
    evaluationsMapPerMetric.set(
      metric,
      new Map<string, TaskEvaluation>(
        evaluations.map((evaluation) => [
          `${evaluation.taskId}::${evaluation.modelId}`,
          evaluation,
        ]),
      ),
    );
  }

  // Step 3: Populate values array
  for (const metricA of Object.keys(evaluationsPerMetric)) {
    for (const metricB of Object.keys(evaluationsPerMetric)) {
      if (metricA !== metricB) {
        // an average over all workers
        evaluationsPerMetric[metricA].forEach((evaluationA) => {
          const valueA = evaluationA[`${metricA}_agg`].value;
          const evaluationB = evaluationsMapPerMetric
            .get(metricB)
            .get(`${evaluationA.taskId}::${evaluationA.modelId}`);
          if (evaluationB) {
            const valueB = evaluationB[`${metricB}_agg`].value;
            valueArrays[metricA][metricB].push({
              valueA:
                typeof valueA === 'string'
                  ? castToNumber(
                      valueA,
                      metrics.find((metric) => metric.name === metricA)?.values,
                    )
                  : valueA,
              valueB:
                typeof valueB === 'string'
                  ? castToNumber(
                      valueB,
                      metrics.find((metric) => metric.name === metricB)?.values,
                    )
                  : valueB,
            });
          }
        });
      }
    }
  }

  // Step 4: Build spearman correlation map
  const correlationMap: { [key: string]: string | number }[] = [];
  for (const [metricNameA, values] of Object.entries(valueArrays)) {
    const metricA = metrics.find((entry) => entry.name === metricNameA);
    for (const [metricNameB, pairs] of Object.entries(values)) {
      const metricB = metrics.find((entry) => entry.name === metricNameB);
      correlationMap.push({
        metricA: metricA ? extractMetricDisplayName(metricA) : metricNameA,
        metricB: metricB ? extractMetricDisplayName(metricB) : metricNameB,
        value:
          metricNameA === metricNameB
            ? 1.0
            : parseFloat(spearman(pairs)?.toFixed(2)),
      });
    }
  }
  return correlationMap;
}

function calculateOverlap(
  evaluationsPerMetric: { [key: string]: TaskEvaluation[] },
  metricA: Metric,
  metricB: Metric,
) {
  // Step 1: Identify evaluations for selected model and metrics
  const modelEvaluationsForMetricA = evaluationsPerMetric[metricA.name];
  const modelEvaluationsForMetricB = evaluationsPerMetric[metricB.name];

  // Step 2: Initialize a MxN matrix (where M and N are ranges of metricA and metricB) with 0s
  const overlapMap: { [key: string]: { [key: string]: number } } = {};
  if (metricA.values && metricB.values) {
    // Initializing indereminate row
    overlapMap['Indeterminate'] = { Indeterminate: 0 };
    for (const metricValueB of metricB.values) {
      overlapMap['Indeterminate'][metricValueB.value] = 0;
    }

    for (const metricValueA of metricA.values) {
      overlapMap[metricValueA.value] = { Indeterminate: 0 };
      for (const metricValueB of metricB.values) {
        overlapMap[metricValueA.value][metricValueB.value] = 0;
      }
    }
  }

  // Step 3: Create a MxN matrix (where M and N are ranges of metricA and metricB)
  modelEvaluationsForMetricA.forEach((evaluationA) => {
    const valueA = bin(evaluationA[`${metricA.name}_agg`].value, metricA);
    const taskId = evaluationA.taskId;
    const modelId = evaluationA.modelId;
    const evaluationB = modelEvaluationsForMetricB.find(
      (entry) => entry.taskId === taskId && entry.modelId === modelId,
    );
    if (evaluationB) {
      const valueB = bin(evaluationB[`${metricB.name}_agg`].value, metricB);
      if (overlapMap.hasOwnProperty(valueA)) {
        if (overlapMap[valueA].hasOwnProperty(valueB)) {
          overlapMap[valueA][valueB] += 1;
        } else {
          overlapMap[valueA][valueB] = 1;
        }
      } else {
        overlapMap[valueA] = { [valueB]: 1 };
      }
    } else {
      console.log(`Check the data in evaluation B for taskId ${taskId}`);
    }
  });
  return overlapMap;
}

function sortMetricAggregatedValues(values: string[], metric: Metric) {
  return values
    .map((v) => {
      return { key: v, value: 0 };
    })
    .sort((a, b) => compareMetricAggregatedValues(a, b, metric))
    .map((entry) => entry.key);
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
export function prepareHeatMapData(
  metricA: Metric,
  metricB: Metric,
  heatMap: { [key: string]: { [key: string]: number } },
) {
  // step 1: Sort heatmap keys
  const sortedMetricAVals = sortMetricAggregatedValues(
    Object.keys(heatMap),
    metricA,
  );
  const metricBVals: string[] = [];
  for (const valueA in heatMap) {
    for (const valueB in heatMap[valueA]) {
      if (!metricBVals.includes(valueB)) {
        metricBVals.push(valueB);
      }
    }
  }
  const sortedMetricBVals = sortMetricAggregatedValues(metricBVals, metricB);

  // Step 2: Prepare heat map data
  const temp: any[] = [];
  let count: number = 0;
  sortedMetricAVals.forEach((metricValA) => {
    sortedMetricBVals.forEach((metricValB) => {
      temp.push({
        metricA: extractMetricDisplayValue(metricValA, metricA.values),
        metricB: extractMetricDisplayValue(metricValB, metricB.values),
        value: heatMap[metricValA][metricValB]
          ? heatMap[metricValA][metricValB]
          : 0,
      });
      count += heatMap[metricValA][metricValB];
    });
  });

  // Step 3: Normalize the counts to percentages
  if (count > 0) {
    const temp2 = temp.map((entry) => ({
      ...entry,
      value: parseFloat(((entry.value / count) * 100).toFixed(2)),
    }));

    return temp2;
  }
  return temp;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default memo(function MetricBehavior({
  evaluationsPerMetric,
  models,
  metrics,
  filters,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [WindowWidth, setWindowWidth] = useState<number>(
    global?.window && window.innerWidth,
  );
  const [WindowHeight, setWindowHeight] = useState<number>(
    global?.window && window.innerHeight,
  );
  const [selectedModels, setSelectedModels] = useState<Model[]>(models);
  const [selectedMetricA, setSelectedMetricA] = useState<Metric | undefined>(
    undefined,
  );
  const [selectedMetricB, setSelectedMetricB] = useState<Metric | undefined>(
    undefined,
  );
  const [selectedFilters, setSelectedFilters] = useState<{
    [key: string]: string[];
  }>({});

  // Step 2: Run effects
  // Step 2.a: Window resizing
  useEffect(() => {
    const handleWindowResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };

    // Step: Add event listener
    window.addEventListener('resize', handleWindowResize);

    // Step: Cleanup to remove event listener
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  // Step 2.a: Fetch theme
  const { theme } = useTheme();

  // Step 2.b: Filter evaluations based on selected models
  const filteredEvaluationsPerMetric = useMemo(() => {
    var filtered = {};
    for (const [metric, evals] of Object.entries(evaluationsPerMetric)) {
      filtered[metric] = evals.filter(
        (evaluation) =>
          selectedModels
            .map((model) => model.modelId)
            .includes(evaluation.modelId) &&
          (!isEmpty(selectedFilters)
            ? areObjectsIntersecting(selectedFilters, evaluation)
            : true),
      );
    }
    return filtered;
  }, [evaluationsPerMetric, selectedModels, selectedFilters]);

  // Step 2.c: Calculate metric-to-metric correlation for selected models
  const metricToMetricCorrelation = useMemo(() => {
    return calculateCorrelation(filteredEvaluationsPerMetric, metrics);
  }, [filteredEvaluationsPerMetric, metrics]);

  // Step 2.d: Calculate metric-to-metric overlap for selected models and metrics
  const metricToMetricOverlap = useMemo(() => {
    if (selectedMetricA && selectedMetricB) {
      return calculateOverlap(
        filteredEvaluationsPerMetric,
        selectedMetricA,
        selectedMetricB,
      );
    } else {
      return undefined;
    }
  }, [filteredEvaluationsPerMetric, selectedMetricA, selectedMetricB]);

  // Step 3: Render
  return (
    <div className={classes.page}>
      <div className={classes.selectors}>
        <div className={classes.modelSelector}>
          <FilterableMultiSelect
            id={'model-selector'}
            titleText="Choose models"
            items={models}
            initialSelectedItems={selectedModels}
            itemToString={(item) => item.name}
            onChange={(event) => {
              setSelectedModels(event.selectedItems);
            }}
            invalid={selectedModels.length === 0}
            invalidText={'You must select a model to review.'}
          ></FilterableMultiSelect>
          <div>
            {selectedModels.map((model) => {
              return (
                <Tag type={'cool-gray'} key={'model-' + model.modelId}>
                  {model.name}
                </Tag>
              );
            })}
          </div>
        </div>
        <div id={'metricA-selector'} className={classes.metricSelector}>
          <MetricSelector
            disabled={Array.isArray(metrics) && !metrics.length}
            metrics={metrics}
            onSelect={(metric: Metric | undefined) => {
              setSelectedMetricA(metric);
            }}
            warn={Array.isArray(metrics) && !metrics.length && !selectedMetricA}
            warnText={'You must select a first metric to proceed.'}
            defaultValue={'all'}
            disabledMetrics={selectedMetricB ? [selectedMetricB] : []}
          />
        </div>
        <div id={'metricB-selector'} className={classes.metricSelector}>
          <MetricSelector
            disabled={Array.isArray(metrics) && !metrics.length}
            metrics={metrics}
            onSelect={(metric: Metric | undefined) => {
              setSelectedMetricB(metric);
            }}
            warn={
              (Array.isArray(metrics) && !metrics.length) ||
              (typeof selectedMetricA !== 'undefined' && !selectedMetricB)
            }
            warnText={'You must select a second metric to proceed.'}
            defaultValue={'all'}
            disabledMetrics={selectedMetricA ? [selectedMetricA] : []}
          />
        </div>
      </div>

      {!isEmpty(filters) ? (
        <Filters
          keyPrefix="MetricBehavior"
          filters={filters}
          selectedFilters={selectedFilters}
          setSelectedFilters={setSelectedFilters}
        />
      ) : null}

      {!selectedMetricA && !selectedMetricB ? (
        !metricToMetricCorrelation ? (
          <div className={classes.tasksContainerWarning}>
            <WarningAlt
              height={'24px'}
              width={'24px'}
              className={classes.tasksContainerWarningIcon}
            />
            <span className={classes.tasksContainerWarningText}>
              Press calculate to compute correlation across all metrics.
            </span>
          </div>
        ) : (
          <div className={classes.row}>
            <HeatmapChart
              data={metricToMetricCorrelation}
              options={{
                // @ts-ignore
                axes: {
                  bottom: {
                    title: 'metric',
                    mapsTo: 'metricA',
                    scaleType: ScaleTypes.LABELS,
                  },
                  left: {
                    title: 'metric',
                    mapsTo: 'metricB',
                    scaleType: ScaleTypes.LABELS,
                  },
                },
                heatmap: {
                  colorLegend: {
                    type: ColorLegendType.QUANTIZE,
                  },
                },
                experimental: false,
                width: Math.round(WindowWidth * 0.6) + 'px',
                height: Math.round(WindowHeight * 0.6) + 'px',
                toolbar: {
                  enabled: false,
                },
                theme: theme,
              }}
            ></HeatmapChart>
          </div>
        )
      ) : !selectedMetricA || !selectedMetricB ? (
        <div className={classes.tasksContainerWarning}>
          <WarningAlt
            height={'24px'}
            width={'24px'}
            className={classes.tasksContainerWarningIcon}
          />
          <span className={classes.tasksContainerWarningText}>
            You must select both metrics in order to see head-to-head %
            instances comparison.
          </span>
        </div>
      ) : selectedMetricA && selectedMetricB ? (
        !metricToMetricOverlap ? (
          <div className={classes.tasksContainerWarning}>
            <WarningAlt
              height={'24px'}
              width={'24px'}
              className={classes.tasksContainerWarningIcon}
            />
            <span className={classes.tasksContainerWarningText}>
              Press calculate to compute overlap between{' '}
              {extractMetricDisplayName(selectedMetricA)} and{' '}
              {extractMetricDisplayName(selectedMetricB)}.
            </span>
          </div>
        ) : (
          <div className={classes.row}>
            <h4>
              % instances with same scores (
              {extractMetricDisplayName(selectedMetricA)} vs.
              {extractMetricDisplayName(selectedMetricB)})
            </h4>
            <HeatmapChart
              data={prepareHeatMapData(
                selectedMetricA,
                selectedMetricB,
                metricToMetricOverlap,
              )}
              options={{
                // @ts-ignore
                axes: {
                  bottom: {
                    title: extractMetricDisplayName(selectedMetricA),
                    mapsTo: 'metricA',
                    scaleType: ScaleTypes.LABELS,
                  },
                  left: {
                    title: extractMetricDisplayName(selectedMetricB),
                    mapsTo: 'metricB',
                    scaleType: ScaleTypes.LABELS,
                  },
                },
                heatmap: {
                  colorLegend: {
                    type: ColorLegendType.QUANTIZE,
                  },
                },
                experimental: false,
                width: `${Math.round(WindowWidth * 0.6)}px`,
                height: `${Math.round(WindowHeight * 0.6)}px`,
                toolbar: {
                  enabled: false,
                },
                theme: theme,
              }}
            ></HeatmapChart>
          </div>
        )
      ) : null}
    </div>
  );
});
