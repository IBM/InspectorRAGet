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
import { useState, useMemo, useEffect, useRef, memo } from 'react';

import { WarningAlt } from '@carbon/icons-react';
import { FilterableMultiSelect, Tag } from '@carbon/react';
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
import TasksTable from '@/src/views/tasks-table/TasksTable';

import '@carbon/charts-react/styles.css';
import classes from './MetricBehavior.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  evaluationsPerMetric: { [key: string]: TaskEvaluation[] };
  models: Model[];
  metrics: Metric[];
  filters: { [key: string]: string[] };
  onTaskSelection: Function;
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

/**
 * Calculate overlap matix between metric values
 * @param evaluationsPerMetric
 * @param metricA
 * @param metricB
 * @returns
 */
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

  // Step 4: Sorted MxN matrix (where M and N are ranges of metricA and metricB)
  const sortedOverlapMap: { [key: string]: { [key: string]: number } } = {};
  // Only sort keys when metric is of 'numerical' type
  if (metricA.type === 'numerical') {
    Object.keys(overlapMap)
      .sort()
      .forEach((a) => {
        if (metricB.type === 'numerical') {
          sortedOverlapMap[a] = Object.fromEntries(
            Object.keys(overlapMap[a])
              .sort()
              .map((b) => [b, overlapMap[a][b]]),
          );
        } else {
          sortedOverlapMap[a] = overlapMap[a];
        }
      });
  } else {
    Object.entries(overlapMap).forEach(([a, b]) => {
      sortedOverlapMap[a] = Object.fromEntries(
        Object.keys(b)
          .sort()
          .map((key) => [key, b[key]]),
      );
    });
  }

  return sortedOverlapMap;
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
      if (heatMap[metricValA][metricValB]) {
        temp.push({
          metricA: extractMetricDisplayValue(metricValA, metricA.values),
          metricB: extractMetricDisplayValue(metricValB, metricB.values),
          value: heatMap[metricValA][metricValB]
            ? heatMap[metricValA][metricValB]
            : 0,
        });
        count += heatMap[metricValA][metricValB];
      }
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
  onTaskSelection,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [WindowWidth, setWindowWidth] = useState<number>(
    global?.window && window.innerWidth,
  );
  const [WindowHeight, setWindowHeight] = useState<number>(
    global?.window && window.innerHeight,
  );
  const [selectedModels, setSelectedModels] = useState<Model[]>(models);
  const [selectedMetricA, setSelectedMetricA] = useState<Metric | undefined>();
  const [selectedMetricB, setSelectedMetricB] = useState<Metric | undefined>();
  const [selectedFilters, setSelectedFilters] = useState<{
    [key: string]: string[];
  }>({});
  const [selectedMetricARange, setSelectedMetricARange] = useState<
    number[] | string
  >();
  const [selectedMetricBRange, setSelectedMetricBRange] = useState<
    number[] | string
  >();
  const tableRef = useRef(null);
  const chartRef = useRef(null);

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
    const filtered: { [key: string]: TaskEvaluation[] } = {};
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

  // Step 2.e: Reset ranges on selected metric change
  useEffect(() => {
    setSelectedMetricARange(undefined);
    setSelectedMetricBRange(undefined);
  }, [selectedMetricA, selectedMetricB]);

  // Step 2.f: Identify visible evaluations
  const visibleEvaluations: TaskEvaluation[] = useMemo(() => {
    if (selectedMetricA && selectedMetricB) {
      // Step 1: Initialize necessary variables
      const selectedModelIds = selectedModels.map((model) => model.modelId);

      const evaluationsPerTask: { [key: string]: TaskEvaluation } = {};

      // Step 2: Add eligible evaluations for 1st selected metric (A)
      filteredEvaluationsPerMetric[selectedMetricA.name].forEach(
        (evaluation) => {
          if (selectedModelIds.includes(evaluation.modelId)) {
            const UUID = `${evaluation.taskId}<::>${evaluation.modelId}`;
            if (selectedMetricARange) {
              if (typeof selectedMetricARange === 'string') {
                if (
                  extractMetricDisplayValue(
                    evaluation[`${selectedMetricA.name}_agg`].value,
                    selectedMetricA.values,
                  ) === selectedMetricARange
                ) {
                  if (evaluationsPerTask.hasOwnProperty(UUID)) {
                    evaluationsPerTask[UUID] = {
                      ...evaluationsPerTask[UUID],
                      [`${selectedMetricA.name}`]:
                        evaluation[`${selectedMetricA.name}`],
                      [`${selectedMetricA.name}_agg`]:
                        evaluation[`${selectedMetricA.name}_agg`],
                    };
                  } else {
                    evaluationsPerTask[UUID] = evaluation;
                  }
                }
              } else if (Array.isArray(selectedMetricARange)) {
                if (
                  evaluation[`${selectedMetricA.name}_agg`].value >=
                    selectedMetricARange[0] &&
                  evaluation[`${selectedMetricA.name}_agg`].value <=
                    selectedMetricARange[1]
                ) {
                  if (evaluationsPerTask.hasOwnProperty(UUID)) {
                    evaluationsPerTask[UUID] = {
                      ...evaluationsPerTask[UUID],
                      [`${selectedMetricA.name}`]:
                        evaluation[`${selectedMetricA.name}`],
                      [`${selectedMetricA.name}_agg`]:
                        evaluation[`${selectedMetricA.name}_agg`],
                    };
                  } else {
                    evaluationsPerTask[UUID] = evaluation;
                  }
                }
              }
            } else {
              if (evaluationsPerTask.hasOwnProperty(UUID)) {
                evaluationsPerTask[UUID] = {
                  ...evaluationsPerTask[UUID],
                  [`${selectedMetricA.name}`]:
                    evaluation[`${selectedMetricA.name}`],
                  [`${selectedMetricA.name}_agg`]:
                    evaluation[`${selectedMetricA.name}_agg`],
                };
              } else {
                evaluationsPerTask[UUID] = evaluation;
              }
            }
          }
        },
      );

      // Step 2: Add eligible evaluations for 2nd selected metric (B)
      filteredEvaluationsPerMetric[selectedMetricB.name].forEach(
        (evaluation) => {
          if (selectedModelIds.includes(evaluation.modelId)) {
            const UUID = `${evaluation.taskId}<::>${evaluation.modelId}`;
            if (selectedMetricBRange) {
              if (typeof selectedMetricBRange === 'string') {
                if (
                  extractMetricDisplayValue(
                    evaluation[`${selectedMetricB.name}_agg`].value,
                    selectedMetricB.values,
                  ) === selectedMetricBRange
                ) {
                  if (evaluationsPerTask.hasOwnProperty(UUID)) {
                    evaluationsPerTask[UUID] = {
                      ...evaluationsPerTask[UUID],
                      [`${selectedMetricB.name}`]:
                        evaluation[`${selectedMetricB.name}`],
                      [`${selectedMetricB.name}_agg`]:
                        evaluation[`${selectedMetricB.name}_agg`],
                    };
                  } else {
                    evaluationsPerTask[UUID] = evaluation;
                  }
                }
              } else if (Array.isArray(selectedMetricBRange)) {
                if (
                  evaluation[`${selectedMetricB.name}_agg`].value >=
                    selectedMetricBRange[0] &&
                  evaluation[`${selectedMetricB.name}_agg`].value <=
                    selectedMetricBRange[1]
                ) {
                  if (evaluationsPerTask.hasOwnProperty(UUID)) {
                    evaluationsPerTask[UUID] = {
                      ...evaluationsPerTask[UUID],
                      [`${selectedMetricB.name}`]:
                        evaluation[`${selectedMetricB.name}`],
                      [`${selectedMetricB.name}_agg`]:
                        evaluation[`${selectedMetricB.name}_agg`],
                    };
                  } else {
                    evaluationsPerTask[UUID] = evaluation;
                  }
                }
              }
            } else {
              if (evaluationsPerTask.hasOwnProperty(UUID)) {
                evaluationsPerTask[UUID] = {
                  ...evaluationsPerTask[UUID],
                  [`${selectedMetricB.name}`]:
                    evaluation[`${selectedMetricB.name}`],
                  [`${selectedMetricB.name}_agg`]:
                    evaluation[`${selectedMetricB.name}_agg`],
                };
              } else {
                evaluationsPerTask[UUID] = evaluation;
              }
            }
          }
        },
      );

      // Step 3: Only retains evaluation tasks where both metric values are available
      return Object.values(evaluationsPerTask).filter(
        (evaluation) =>
          evaluation.hasOwnProperty(`${selectedMetricA.name}`) &&
          evaluation.hasOwnProperty(`${selectedMetricA.name}_agg`) &&
          evaluation.hasOwnProperty(`${selectedMetricB.name}`) &&
          evaluation.hasOwnProperty(`${selectedMetricB.name}_agg`),
      );
    }
    return [];
  }, [
    filteredEvaluationsPerMetric,
    selectedModels,
    selectedMetricA,
    selectedMetricARange,
    selectedMetricB,
    selectedMetricBRange,
  ]);

  // Step 2.g: Add chart event
  useEffect(() => {
    // Step 2.g.i: Update function
    function onClick(event) {
      // Set range for 1st selected metric (A)
      if (selectedMetricA?.type === 'numerical') {
        if (event.detail.datum['metricA'].substring(1).includes('-')) {
          const match = event.detail.datum['metricA'].match(
            /^(-?\d*\.?\d*)-(-?\d*\.?\d*)$/,
          );
          setSelectedMetricARange([parseFloat(match[1]), parseFloat(match[2])]);
        } else {
          setSelectedMetricARange([
            parseFloat(event.detail.datum['metricA']),
            parseFloat(event.detail.datum['metricA']),
          ]);
        }
      } else {
        setSelectedMetricARange(event.detail.datum['metricA']);
      }

      // Set range for 2nd selected metric (B)
      if (selectedMetricB?.type === 'numerical') {
        if (event.detail.datum['metricB'].substring(1).includes('-')) {
          const match = event.detail.datum['metricB'].match(
            /^(-?\d*\.?\d*)-(-?\d*\.?\d*)$/,
          );
          setSelectedMetricBRange([parseFloat(match[1]), parseFloat(match[2])]);
        } else {
          setSelectedMetricARange([
            parseFloat(event.detail.datum['metricB']),
            parseFloat(event.detail.datum['metricB']),
          ]);
        }
      } else {
        setSelectedMetricBRange(event.detail.datum['metricB']);
      }
    }

    // Step 2.g.ii: Local copy of reference
    let ref = null;

    // Step 2.g.iii: Update reference and add event
    if (chartRef && chartRef.current) {
      ref = chartRef.current;

      //@ts-ignore
      ref.chart.services.events.addEventListener('heatmap-click', onClick);
    }

    // Step 2.g.iv: Cleanup function
    return () => {
      if (ref) {
        //@ts-ignore
        ref.chart.services.events.removeEventListener('heatmap-click', onClick);
      }
    };
  }, [chartRef, selectedMetricA, selectedMetricB, metricToMetricOverlap]);

  // Step 2.h: Scroll task table into view
  useEffect(() => {
    if (
      selectedMetricARange &&
      selectedMetricBRange &&
      tableRef &&
      tableRef.current
    ) {
      //@ts-ignore
      tableRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
        inline: 'center',
      });
    }
  }, [tableRef, selectedMetricARange, selectedMetricBRange]);

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
            <h4 className={classes.graphTitle}>
              <strong>Spearman correlation</strong>
              <span>
                {`(${Object.values(filteredEvaluationsPerMetric)[0].length ? Object.values(filteredEvaluationsPerMetric)[0].length / (selectedModels ? selectedModels.length : 1) : 0}/${Object.values(evaluationsPerMetric)[0].length / models.length})`}
              </span>
            </h4>
            <HeatmapChart
              data={metricToMetricCorrelation}
              options={{
                // @ts-ignore
                axes: {
                  bottom: {
                    title: 'Metrics',
                    mapsTo: 'metricA',
                    scaleType: ScaleTypes.LABELS,
                  },
                  left: {
                    title: 'Metrics',
                    mapsTo: 'metricB',
                    scaleType: ScaleTypes.LABELS,
                  },
                },
                heatmap: {
                  colorLegend: {
                    type: ColorLegendType.QUANTIZE,
                  },
                },
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
            <h4 className={classes.graphTitle}>
              <strong>
                % instances with same scores (
                {extractMetricDisplayName(selectedMetricA)} vs.
                {extractMetricDisplayName(selectedMetricB)})
              </strong>
              <span>
                {`(${Object.values(filteredEvaluationsPerMetric)[0].length ? Object.values(filteredEvaluationsPerMetric)[0].length / (selectedModels ? selectedModels.length : 1) : 0}/${Object.values(evaluationsPerMetric)[0].length / models.length})`}
              </span>
            </h4>
            <HeatmapChart
              ref={chartRef}
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

      {selectedMetricA && selectedMetricB && !isEmpty(visibleEvaluations) ? (
        <div ref={tableRef} className={classes.tasksTableContainer}>
          <h4>
            Tasks<sup>*</sup>
          </h4>

          <TasksTable
            metrics={[selectedMetricA, selectedMetricB]}
            evaluations={visibleEvaluations}
            models={selectedModels}
            filters={filters}
            onClick={onTaskSelection}
          />
          <span className={classes.tasksTableWarning}>
            <sup>*</sup> Only tasks with aggregate scores in selected range are
            shown in the above table.
          </span>
        </div>
      ) : null}
    </div>
  );
});
