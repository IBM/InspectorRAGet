/**
 *
 * Copyright 2023-present InspectorRAGet Team
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
import { ModelResult, Model, Metric } from '@/src/types';
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

// --- Types ---
interface Props {
  resultsPerMetric: { [key: string]: ModelResult[] };
  models: Model[];
  metrics: Metric[];
  filters: { [key: string]: string[] };
  onTaskSelection: Function;
}

// --- Compute functions ---
/**
 * Calculate correlation for every metric against every other metric
 * @param resultsPerMetric
 * @param metrics
 * @returns
 */
function calculateCorrelation(
  resultsPerMetric: {
    [key: string]: ModelResult[];
  },
  metrics: Metric[],
) {
  let valueArrays: {
    [key: string]: { [key: string]: any[] };
  } = {};
  Object.keys(resultsPerMetric).forEach((metric1: string) => {
    valueArrays[metric1] = {};
    Object.keys(resultsPerMetric).forEach(
      (metric2: string) => (valueArrays[metric1][metric2] = []),
    );
  });

  // Index results by metric for O(1) lookup in the pairing loop below
  const resultsMapPerMetric = new Map();
  for (const [metric, results] of Object.entries(resultsPerMetric)) {
    resultsMapPerMetric.set(
      metric,
      new Map<string, ModelResult>(
        results.map((evaluation) => [
          `${evaluation.taskId}::${evaluation.modelId}`,
          evaluation,
        ]),
      ),
    );
  }

  for (const metricA of Object.keys(resultsPerMetric)) {
    for (const metricB of Object.keys(resultsPerMetric)) {
      if (metricA !== metricB) {
        // an average over all workers
        resultsPerMetric[metricA].forEach((evaluationA) => {
          const valueA = evaluationA[`${metricA}_agg`].value;
          const evaluationB = resultsMapPerMetric
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
 * @param resultsPerMetric
 * @param metricA
 * @param metricB
 * @returns
 */
function calculateOverlap(
  resultsPerMetric: { [key: string]: ModelResult[] },
  metricA: Metric,
  metricB: Metric,
) {
  const modelResultsForMetricA = resultsPerMetric[metricA.name];
  const modelResultsForMetricB = resultsPerMetric[metricB.name];

  // Initialize MxN overlap matrix (metric value ranges x metric value ranges)
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

  // Pre-index metricB results by "taskId::modelId" for O(1) lookup below
  const metricBByTaskAndModel = new Map(
    modelResultsForMetricB.map((e) => [`${e.taskId}::${e.modelId}`, e]),
  );

  // Populate the overlap counts by matching results across both metrics
  modelResultsForMetricA.forEach((evaluationA) => {
    const valueA = bin(evaluationA[`${metricA.name}_agg`].value, metricA);
    const taskId = evaluationA.taskId;
    const modelId = evaluationA.modelId;
    const evaluationB = metricBByTaskAndModel.get(`${taskId}::${modelId}`);
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
    }
  });

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

/**
 * Merge one metric's result fields into the shared per-task result accumulator,
 * but only when the evaluation's aggregate value falls within the selected range.
 *
 * A string range means the display value must match exactly (categorical).
 * A number[] range means the raw aggregate value must fall within [min, max].
 * Undefined range means all values pass.
 */
function mergeMetricResult(
  resultsPerTask: { [key: string]: ModelResult },
  evaluation: ModelResult,
  metric: Metric,
  range: number[] | string | undefined,
) {
  const aggKey = `${metric.name}_agg`;
  const aggValue = evaluation[aggKey].value;

  const inRange =
    range === undefined
      ? true
      : typeof range === 'string'
        ? extractMetricDisplayValue(aggValue, metric.values) === range
        : aggValue >= range[0] && aggValue <= range[1];

  if (!inRange) return;

  const UUID = `${evaluation.taskId}<::>${evaluation.modelId}`;
  if (resultsPerTask[UUID]) {
    resultsPerTask[UUID] = {
      ...resultsPerTask[UUID],
      [metric.name]: evaluation[metric.name],
      [aggKey]: evaluation[aggKey],
    };
  } else {
    resultsPerTask[UUID] = evaluation;
  }
}

// --- Render functions ---
export function prepareHeatMapData(
  metricA: Metric,
  metricB: Metric,
  heatMap: { [key: string]: { [key: string]: number } },
) {
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

  if (count > 0) {
    return temp.map((entry) => ({
      ...entry,
      value: parseFloat(((entry.value / count) * 100).toFixed(2)),
    }));
  }

  return temp;
}

// --- Main component ---
export default memo(function MetricBehavior({
  resultsPerMetric,
  models,
  metrics,
  filters,
  onTaskSelection,
}: Props) {
  const [windowWidth, setWindowWidth] = useState<number>(
    global?.window && window.innerWidth,
  );
  const [windowHeight, setWindowHeight] = useState<number>(
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

  useEffect(() => {
    const handleWindowResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  const { theme } = useTheme();

  const filteredResultsPerMetric = useMemo(() => {
    const selectedModelIds = new Set(selectedModels.map((m) => m.modelId));
    const hasFilters = !isEmpty(selectedFilters);
    const filtered: { [key: string]: ModelResult[] } = {};
    for (const [metric, results] of Object.entries(resultsPerMetric)) {
      filtered[metric] = results.filter(
        (result) =>
          selectedModelIds.has(result.modelId) &&
          (hasFilters ? areObjectsIntersecting(selectedFilters, result) : true),
      );
    }
    return filtered;
  }, [resultsPerMetric, selectedModels, selectedFilters]);

  const metricToMetricCorrelation = useMemo(() => {
    return calculateCorrelation(filteredResultsPerMetric, metrics);
  }, [filteredResultsPerMetric, metrics]);

  const metricToMetricOverlap = useMemo(() => {
    if (selectedMetricA && selectedMetricB) {
      return calculateOverlap(
        filteredResultsPerMetric,
        selectedMetricA,
        selectedMetricB,
      );
    } else {
      return undefined;
    }
  }, [filteredResultsPerMetric, selectedMetricA, selectedMetricB]);

  // Reset range selections when metrics change — range is only meaningful for the current metric
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset; ranges are UI state tied to the selected metric, not derived from it
    setSelectedMetricARange(undefined);
    setSelectedMetricBRange(undefined);
  }, [selectedMetricA, selectedMetricB]);

  const visibleResults: ModelResult[] = useMemo(() => {
    if (selectedMetricA && selectedMetricB) {
      const selectedModelIds = new Set(
        selectedModels.map((model) => model.modelId),
      );
      const resultsPerTask: { [key: string]: ModelResult } = {};

      // Collect results for metric A, filtered by selected range
      filteredResultsPerMetric[selectedMetricA.name].forEach((evaluation) => {
        if (selectedModelIds.has(evaluation.modelId)) {
          mergeMetricResult(
            resultsPerTask,
            evaluation,
            selectedMetricA,
            selectedMetricARange,
          );
        }
      });

      // Collect results for metric B, filtered by selected range
      filteredResultsPerMetric[selectedMetricB.name].forEach((evaluation) => {
        if (selectedModelIds.has(evaluation.modelId)) {
          mergeMetricResult(
            resultsPerTask,
            evaluation,
            selectedMetricB,
            selectedMetricBRange,
          );
        }
      });

      // Only retain tasks where both metric values are present
      return Object.values(resultsPerTask).filter(
        (evaluation) =>
          evaluation.hasOwnProperty(selectedMetricA.name) &&
          evaluation.hasOwnProperty(`${selectedMetricA.name}_agg`) &&
          evaluation.hasOwnProperty(selectedMetricB.name) &&
          evaluation.hasOwnProperty(`${selectedMetricB.name}_agg`),
      );
    }
    return [];
  }, [
    filteredResultsPerMetric,
    selectedModels,
    selectedMetricA,
    selectedMetricARange,
    selectedMetricB,
    selectedMetricBRange,
  ]);

  // Attach click handler to the heatmap so clicking a cell filters the tasks table
  useEffect(() => {
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
          setSelectedMetricBRange([
            parseFloat(event.detail.datum['metricB']),
            parseFloat(event.detail.datum['metricB']),
          ]);
        }
      } else {
        setSelectedMetricBRange(event.detail.datum['metricB']);
      }
    }

    // Keep a local copy so cleanup can remove the listener even if chartRef changes
    let ref = null;

    if (chartRef && chartRef.current) {
      ref = chartRef.current;

      //@ts-ignore
      ref.chart.services.events.addEventListener('heatmap-click', onClick);
    }

    return () => {
      if (ref) {
        //@ts-ignore
        ref.chart.services.events.removeEventListener('heatmap-click', onClick);
      }
    };
  }, [chartRef, selectedMetricA, selectedMetricB, metricToMetricOverlap]);

  // Scroll the tasks table into view when a heatmap cell is selected
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

  return (
    <div className={classes.page}>
      <div className={classes.selectors}>
        <div className={classes.modelSelector}>
          <FilterableMultiSelect
            id={'metric-behavior-model-selector'}
            titleText="Choose models"
            items={models}
            selectedItems={selectedModels}
            itemToString={(item) => (item ? item.name : '')}
            onChange={(event) => {
              setSelectedModels(event.selectedItems);
            }}
            invalid={selectedModels.length === 0}
            invalidText={'You must select a model to review.'}
          ></FilterableMultiSelect>
          <div className={classes.tagList}>
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
                {`(${Object.values(filteredResultsPerMetric)[0].length ? Object.values(filteredResultsPerMetric)[0].length / (selectedModels ? selectedModels.length : 1) : 0}/${Object.values(resultsPerMetric)[0].length / models.length})`}
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
                width: Math.round(windowWidth * 0.6) + 'px',
                height: Math.round(windowHeight * 0.6) + 'px',
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
                {`(${Object.values(filteredResultsPerMetric)[0].length ? Object.values(filteredResultsPerMetric)[0].length / (selectedModels ? selectedModels.length : 1) : 0}/${Object.values(resultsPerMetric)[0].length / models.length})`}
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
                width: `${Math.round(windowWidth * 0.6)}px`,
                height: `${Math.round(windowHeight * 0.6)}px`,
                toolbar: {
                  enabled: false,
                },
                theme: theme,
              }}
            ></HeatmapChart>
          </div>
        )
      ) : null}

      {selectedMetricA && selectedMetricB && !isEmpty(visibleResults) ? (
        <div ref={tableRef} className={classes.tasksTableContainer}>
          <h4>
            Tasks<sup>*</sup>
          </h4>

          <TasksTable
            metrics={[selectedMetricA, selectedMetricB]}
            results={visibleResults}
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
