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

import { countBy, isEmpty } from 'lodash';
import cx from 'classnames';
import { useState, useMemo, useEffect, useRef } from 'react';
import { Tile, Button, Slider } from '@carbon/react';
import { WarningAlt } from '@carbon/icons-react';
import { ScatterChart } from '@carbon/charts-react';

import { useTheme } from '@/src/theme';
import { Model, Metric, ModelResult } from '@/src/types';
import {
  castToNumber,
  AgreementLevels,
  extractMetricDisplayName,
} from '@/src/utilities/metrics';
import { calculateFisherRandomization } from '@/src/utilities/significance';
import { areObjectsIntersecting } from '@/src/utilities/objects';
import { hash } from '@/src/utilities/strings';

import Filters from '@/src/components/filters/Filters';
import TasksTable from '@/src/views/tasks-table/TasksTable';
import ModelSelector from '@/src/components/selectors/ModelSelector';
import MetricSelector from '@/src/components/selectors/MetricSelector';
import { getModelColorPalette } from '@/src/utilities/colors';

import '@carbon/charts-react/styles.css';
import classes from './ModelComparator.module.scss';

// --- Types ---

type StatisticalInformation = {
  p: number;
  distributionA: number[];
  meanA: number;
  distributionB: number[];
  meanB: number;
  taskIds?: string[];
};

interface Props {
  resultsPerMetric: { [key: string]: ModelResult[] };
  models: Model[];
  metrics: Metric[];
  filters: { [key: string]: string[] };
  onTaskSelection: Function;
}

// --- Compute functions ---

/**
 * Build per-task result pairs for the two selected models.
 *
 * Eligibility: both models must have a result for the task, each result must
 * have a non-NO_AGREEMENT value for the selected metric, and any active filters
 * must pass.
 */
function extractResultsPerTask(
  results: ModelResult[],
  modelA: Model,
  modelB: Model,
  metric: string,
  selectedFilters: { [key: string]: string[] },
  selectedMetricRange?: number[],
) {
  const modelResultsPerTask: { [key: string]: ModelResult[] } = {};

  // Retain results that belong to selected models, have agreement, and pass filters
  results.forEach((evaluation) => {
    if (
      (evaluation.modelId === modelA.modelId ||
        evaluation.modelId === modelB.modelId) &&
      evaluation[`${metric}_agg`].level !== AgreementLevels.NO_AGREEMENT &&
      (!isEmpty(selectedFilters)
        ? areObjectsIntersecting(selectedFilters, evaluation)
        : true)
    ) {
      const modelResultsForTask = modelResultsPerTask[evaluation.taskId];
      if (modelResultsForTask) {
        modelResultsForTask.push(evaluation);
      } else {
        modelResultsPerTask[evaluation.taskId] = [evaluation];
      }
    }
  });

  // Only keep tasks that have results for both models
  // and where at least one model's aggregate value falls in the selected range
  return Object.values(modelResultsPerTask).filter(
    (entry) =>
      entry.length === 2 &&
      (selectedMetricRange
        ? (entry[0][`${metric}_agg`].value >= selectedMetricRange[0] &&
            entry[0][`${metric}_agg`].value <= selectedMetricRange[1]) ||
          (entry[1][`${metric}_agg`].value >= selectedMetricRange[0] &&
            entry[1][`${metric}_agg`].value <= selectedMetricRange[1])
        : true),
  );
}

/**
 * Run Fisher randomization significance test for modelA vs modelB.
 * When selectedMetric is undefined, runs across all metrics in resultsPerMetric.
 */
function runStatisticalSignificanceTest(
  resultsPerMetric: { [key: string]: ModelResult[] },
  metrics: Metric[],
  modelA: Model,
  modelB: Model,
  selectedMetric: Metric | undefined,
  selectedFilters: { [key: string]: string[] },
  selectedMetricRange?: number[],
) {
  const resultsPerMetricPerTask: { [key: string]: ModelResult[][] } = {};
  if (selectedMetric) {
    const resultsPerTask = extractResultsPerTask(
      resultsPerMetric[selectedMetric.name],
      modelA,
      modelB,
      selectedMetric.name,
      selectedFilters,
      selectedMetricRange,
    );

    if (resultsPerTask.length !== 0) {
      resultsPerMetricPerTask[selectedMetric.name] = resultsPerTask;
    }
  } else {
    Object.keys(resultsPerMetric).forEach((metric) => {
      const resultsPerTask = extractResultsPerTask(
        resultsPerMetric[metric],
        modelA,
        modelB,
        metric,
        selectedFilters,
        selectedMetricRange,
      );
      if (resultsPerTask.length !== 0) {
        resultsPerMetricPerTask[metric] = resultsPerTask;
      }
    });
  }

  const distributionA: { [key: string]: number[] } = {};
  const distributionB: { [key: string]: number[] } = {};
  const taskIds: { [key: string]: string[] } = {};

  Object.keys(resultsPerMetricPerTask).forEach((metric) => {
    const metricValues = metrics.find((entry) => entry.name === metric)?.values;
    taskIds[metric] = resultsPerMetricPerTask[metric].map(
      (entry) => entry[0].taskId,
    );

    distributionA[metric] = resultsPerMetricPerTask[metric].map((entry) =>
      castToNumber(
        entry[0].modelId === modelA.modelId
          ? entry[0][`${metric}_agg`].value
          : entry[1][`${metric}_agg`].value,
        metricValues,
      ),
    );

    distributionB[metric] = resultsPerMetricPerTask[metric].map((entry) =>
      castToNumber(
        entry[1].modelId === modelB.modelId
          ? entry[1][`${metric}_agg`].value
          : entry[0][`${metric}_agg`].value,
        metricValues,
      ),
    );
  });

  // Compute p-value and means via Fisher randomization for each metric
  const information: { [key: string]: StatisticalInformation } = {};
  Object.keys(resultsPerMetricPerTask).forEach((metric) => {
    const [p, meanA, meanB] = calculateFisherRandomization(
      distributionA[metric],
      distributionB[metric],
    );
    information[metric] = {
      p: p,
      distributionA: distributionA[metric],
      meanA: meanA,
      distributionB: distributionB[metric],
      meanB: meanB,
      taskIds: taskIds[metric],
    };
  });

  return information;
}

// --- Render functions ---

function prepareScatterPlotData(
  modelA: string,
  distributionA: number[],
  modelB: string,
  distributionB: number[],
  taskIds?: string[],
) {
  if (distributionA.length !== distributionB.length) {
    return [];
  }

  const distributions: { values: number[]; taskId: string }[] = [];
  distributionA.forEach((valueA, index) => {
    distributions.push({
      taskId: taskIds ? taskIds[index] : `${index}`,
      values: [valueA, distributionB[index]],
    });
  });

  distributions.sort((a, b) => a.values[0] - b.values[0]);
  distributions.sort((a, b) => a.values[1] - b.values[1]);
  const chartData: { [key: string]: string | number }[] = [];
  distributions.forEach((entry, idx) => {
    // Model A record
    chartData.push({
      group: modelA,
      key: idx,
      value: entry.values[0],
      ...(taskIds && { taskId: entry.taskId }),
    });

    // Model B record
    chartData.push({
      group: modelB,
      key: idx,
      value: entry.values[1],
      ...(taskIds && { taskId: entry.taskId }),
    });
  });

  return chartData;
}

function renderResult(
  statisticalInformationPerMetric: { [key: string]: StatisticalInformation },
  metric: Metric,
  modelA: Model,
  modelB: Model,
  numResults: number,
  modelColors: { [key: string]: string },
  modelOrder: string[],
  theme?: string,
) {
  if (statisticalInformationPerMetric.hasOwnProperty(metric.name)) {
    return (
      <div
        key={'statisticalInformation-metric-' + metric.name}
        className={classes.performanceInformation}
      >
        <h5>
          <strong>{extractMetricDisplayName(metric)}</strong>
        </h5>
        <Tile className={classes.tile}>
          <div className={classes.tileContent}>
            <span className={classes.tileContentInformation}>p-value</span>
            <span
              className={classes.tileContentValue}
              suppressHydrationWarning={true}
            >
              {statisticalInformationPerMetric[metric.name]['p'].toFixed(4)}
            </span>
            <span
              className={classes.tileContentDecision}
              suppressHydrationWarning={true}
            >
              {statisticalInformationPerMetric[metric.name]['p'] <= 0.05
                ? 'Significant'
                : 'Not significant'}
            </span>
          </div>
        </Tile>
        <ScatterChart
          data={prepareScatterPlotData(
            modelA.name,
            statisticalInformationPerMetric[metric.name].distributionA,
            modelB.name,
            statisticalInformationPerMetric[metric.name].distributionB,
            statisticalInformationPerMetric[metric.name].taskIds,
          )}
          options={{
            axes: {
              left: {
                mapsTo: 'value',
                ...(metric.type === 'numerical' &&
                  typeof metric.minValue === 'number' &&
                  typeof metric.maxValue === 'number' && {
                    domain: [metric.minValue, metric.maxValue],
                  }),
                ...(metric.type === 'categorical' &&
                  typeof metric.minValue !== 'number' &&
                  typeof metric.maxValue !== 'number' && {
                    domain: [
                      castToNumber(metric.minValue?.value || 0, metric.values),
                      castToNumber(metric.maxValue?.value || 4, metric.values),
                    ],
                  }),
                title: extractMetricDisplayName(metric),
              },
              bottom: {
                mapsTo: 'key',
                ticks: {
                  values: [],
                },
                title: `Tasks (${
                  statisticalInformationPerMetric[metric.name].distributionA
                    .length
                }/${numResults})`,
              },
            },
            width: '500px',
            height: '500px',
            toolbar: {
              enabled: false,
            },
            color: {
              scale: modelColors,
            },
            legend: {
              order: modelOrder,
            },
            theme: theme,
          }}
        ></ScatterChart>
      </div>
    );
  } else {
    return null;
  }
}

// --- Main component ---

export default function ModelComparator({
  resultsPerMetric,
  models,
  metrics,
  filters,
  onTaskSelection,
}: Props) {
  const [windowWidth, setWindowWidth] = useState<number>(
    global?.window && window.innerWidth,
  );
  const [modelA, setModelA] = useState<Model>(models[0]);
  const [modelB, setModelB] = useState<Model>(models[1]);
  const [selectedMetric, setSelectedMetric] = useState<Metric | undefined>(
    undefined,
  );
  const [selectedFilters, setSelectedFilters] = useState<{
    [key: string]: string[];
  }>({});
  const [statisticalInformationPerMetric, setStatisticalInformationPerMetric] =
    useState<{ [key: string]: StatisticalInformation } | undefined>(undefined);
  const [modelColors, modelOrder] = getModelColorPalette(models);
  const [selectedMetricRange, setSelectedMetricRange] = useState<number[]>();
  const chartRef = useRef(null);

  useEffect(() => {
    const handleWindowResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  const { theme } = useTheme();
  const [humanMetrics, algorithmMetrics] = useMemo(() => {
    const hMetrics: Metric[] = [];
    const aMetrics: Metric[] = [];

    Object.values(metrics).forEach((metric) => {
      if (metric.author === 'human') {
        hMetrics.push(metric);
      } else if (metric.author === 'algorithm') {
        aMetrics.push(metric);
      }
    });

    return [hMetrics, aMetrics];
  }, [metrics]);

  // Reset metric range when metric changes — range is only valid for numerical metrics
  useEffect(() => {
    if (
      selectedMetric &&
      selectedMetric.type === 'numerical' &&
      selectedMetric.range
    ) {
      setSelectedMetricRange([
        selectedMetric.range[0],
        selectedMetric.range[1],
      ]);
    } else setSelectedMetricRange(undefined);
  }, [selectedMetric]);

  const filteredResults = useMemo(() => {
    if (selectedMetric) {
      const resultsForSelectedModels = resultsPerMetric[
        selectedMetric.name
      ].filter(
        (evaluation) =>
          (evaluation.modelId === modelA.modelId ||
            evaluation.modelId === modelB.modelId) &&
          (!isEmpty(selectedFilters)
            ? areObjectsIntersecting(selectedFilters, evaluation)
            : true),
      );

      const resultsPerTask: { [key: string]: { [key: string]: number } } = {};
      resultsForSelectedModels.forEach((evaluation) => {
        const entry = resultsPerTask[evaluation.taskId];
        if (entry) {
          entry[evaluation.modelId] =
            evaluation[`${selectedMetric.name}_agg`].value;
        } else {
          resultsPerTask[evaluation.taskId] = {
            [evaluation.modelId]:
              evaluation[`${selectedMetric.name}_agg`].value,
          };
        }
      });

      // Only keep tasks where models have different aggregate scores
      // and at least one model's aggregate falls in the selected range
      const visibleResultTaskIds = Object.keys(resultsPerTask).filter(
        (taskId) =>
          Object.keys(countBy(Object.values(resultsPerTask[taskId]))).length >
            1 &&
          (selectedMetricRange
            ? (Object.values(resultsPerTask[taskId])[0] >=
                selectedMetricRange[0] &&
                Object.values(resultsPerTask[taskId])[0] <=
                  selectedMetricRange[1]) ||
              (Object.values(resultsPerTask[taskId])[1] >=
                selectedMetricRange[0] &&
                Object.values(resultsPerTask[taskId])[1] <=
                  selectedMetricRange[1])
            : true),
      );

      return resultsForSelectedModels.filter((evaluation) =>
        visibleResultTaskIds.includes(evaluation.taskId),
      );
    }
    return [];
  }, [
    resultsPerMetric,
    selectedMetric,
    modelA,
    modelB,
    selectedFilters,
    selectedMetricRange,
  ]);

  // Reset statistical information when models or filters change
  useEffect(() => {
    setStatisticalInformationPerMetric(undefined);
  }, [modelA, modelB, selectedFilters]);

  // Recalculate statistical information when metric or range changes
  useEffect(() => {
    if (
      !selectedMetric &&
      statisticalInformationPerMetric &&
      Object.keys(statisticalInformationPerMetric).length === 1
    ) {
      setStatisticalInformationPerMetric(
        runStatisticalSignificanceTest(
          resultsPerMetric,
          metrics,
          modelA,
          modelB,
          selectedMetric,
          selectedFilters,
          selectedMetricRange,
        ),
      );
    } else if (
      selectedMetric &&
      selectedMetricRange &&
      statisticalInformationPerMetric &&
      statisticalInformationPerMetric.hasOwnProperty(selectedMetric.name)
    ) {
      setStatisticalInformationPerMetric(
        runStatisticalSignificanceTest(
          resultsPerMetric,
          metrics,
          modelA,
          modelB,
          selectedMetric,
          selectedFilters,
          selectedMetricRange,
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally reads stable refs (resultsPerMetric, models, filters) from closure; only re-runs when metric or range selection changes
  }, [selectedMetric, selectedMetricRange]);

  // Estimate computation complexity to warn users about long-running calculations
  const complexity = useMemo(() => {
    let size = 0;
    if (selectedMetric) {
      size = resultsPerMetric[selectedMetric.name].length / models.length;
    } else {
      size = Object.values(resultsPerMetric)
        .map((results) => results.length / models.length)
        .reduce((a, b) => a + b, 0);
    }

    if (size > 1000) {
      return 'high';
    }
    return 'low';
  }, [resultsPerMetric, selectedMetric, models]);

  // Attach click handler to scatter chart points for task selection.
  // The handler is stored in a variable so the same reference is passed to both
  // addEventListener and removeEventListener — a new arrow function in cleanup
  // would never match the registered listener.
  useEffect(() => {
    let ref = null;

    function handleScatterClick({
      detail,
    }: {
      detail: { datum: { taskId: string } };
    }) {
      onTaskSelection(detail.datum.taskId);
    }

    if (chartRef && chartRef.current) {
      ref = chartRef.current;
      //@ts-ignore
      ref.chart.services.events.addEventListener(
        'scatter-click',
        handleScatterClick,
      );
    }

    return () => {
      if (ref) {
        //@ts-ignore
        ref.chart.services.events.removeEventListener(
          'scatter-click',
          handleScatterClick,
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onTaskSelection is a stable prop callback; adding it would re-bind the chart event on every render
  }, [chartRef, selectedMetric, statisticalInformationPerMetric]);

  return (
    <div className={classes.page}>
      <div className={classes.selectors}>
        <div className={classes.modelSelector}>
          <ModelSelector
            id={'modelA-selector-excluding-model-' + modelB.modelId}
            key={'modelA-selector-excluding-model-' + modelB.modelId}
            models={models}
            defaultValue={modelA}
            onSelect={(modelId: string) => {
              const selectedModel = models.find(
                (model) => model.modelId === modelId,
              );
              if (selectedModel) {
                setModelA(selectedModel);
              }
            }}
            disabledModels={[modelB]}
          />
        </div>
        <div className={classes.modelSelector}>
          <ModelSelector
            id={'modelB-selector-excluding-model-' + modelA.modelId}
            key={'modelB-selector-excluding-model-' + modelA.modelId}
            models={models}
            defaultValue={modelB}
            onSelect={(modelId: string) => {
              const selectedModel = models.find(
                (model) => model.modelId === modelId,
              );
              if (selectedModel) {
                setModelB(selectedModel);
              }
            }}
            disabledModels={[modelA]}
          />
        </div>
        <div className={classes.metricSelector}>
          <MetricSelector
            metrics={metrics}
            onSelect={(metric: Metric | undefined) => {
              setSelectedMetric(metric);
            }}
            warn={!selectedMetric}
            warnText={'You must select a single metric to view tasks. '}
          />
        </div>
        {selectedMetric &&
        selectedMetric.type === 'numerical' &&
        selectedMetric.range ? (
          <div>
            <Slider
              ariaLabelInput="Lower bound"
              unstable_ariaLabelInputUpper="Upper bound"
              labelText={`Choose range`}
              value={
                selectedMetricRange
                  ? selectedMetricRange[0]
                  : selectedMetric.range[0]
              }
              unstable_valueUpper={
                selectedMetricRange
                  ? selectedMetricRange[1]
                  : selectedMetric.range[1]
              }
              min={selectedMetric.range[0]}
              max={selectedMetric.range[1]}
              step={
                selectedMetric.range.length === 3 ? selectedMetric.range[2] : 1
              }
              onChange={({
                value,
                valueUpper,
              }: {
                value: number;
                valueUpper?: number;
              }) => {
                setSelectedMetricRange((prev) => [
                  value,
                  valueUpper
                    ? valueUpper
                    : prev
                      ? prev[1]
                      : selectedMetric.range
                        ? selectedMetric.range[2]
                        : 100,
                ]);
              }}
            />
          </div>
        ) : null}
        <div className={classes.calculateBtn}>
          <Button
            onClick={() => {
              // Run statistical significance calculations
              setStatisticalInformationPerMetric(
                runStatisticalSignificanceTest(
                  resultsPerMetric,
                  metrics,
                  modelA,
                  modelB,
                  selectedMetric,
                  selectedFilters,
                  selectedMetricRange,
                ),
              );
            }}
          >
            Calculate
          </Button>
        </div>
      </div>

      {!isEmpty(filters) ? (
        <Filters
          keyPrefix="ModelComparator"
          filters={filters}
          selectedFilters={selectedFilters}
          setSelectedFilters={setSelectedFilters}
        />
      ) : null}

      {statisticalInformationPerMetric ? (
        <div className={classes.row}>
          <div className={classes.hypothesisContainer}>
            <span className={classes.hypothesisStatement}>
              H<sub>0</sub>: {modelA.name} and {modelB.name} scores are derived
              from the same distribution.
            </span>
            <span className={classes.hypothesisValidityCondition}>
              <span>{'Reject the null hypothesis if p < 0.05'}</span>
            </span>
          </div>

          {!selectedMetric && humanMetrics.length ? (
            <div className={classes.row}>
              <h4>Human Evaluations</h4>
              <div
                className={cx(
                  humanMetrics.length > 3
                    ? classes.graphsGrid
                    : classes.graphsFlex,
                )}
              >
                {humanMetrics.map((metric) =>
                  renderResult(
                    statisticalInformationPerMetric,
                    metric,
                    modelA,
                    modelB,
                    resultsPerMetric[metric.name].length / models.length,
                    modelColors,
                    modelOrder,
                    theme,
                  ),
                )}
              </div>
            </div>
          ) : null}

          {!selectedMetric && algorithmMetrics.length ? (
            <div className={classes.row}>
              <h4>Algorithmic Evaluations</h4>
              <div
                className={cx(
                  algorithmMetrics.length > 3
                    ? classes.graphsGrid
                    : classes.graphsFlex,
                )}
              >
                {algorithmMetrics.map((metric) =>
                  renderResult(
                    statisticalInformationPerMetric,
                    metric,
                    modelA,
                    modelB,
                    resultsPerMetric[metric.name].length / models.length,
                    modelColors,
                    modelOrder,
                    theme,
                  ),
                )}
              </div>
            </div>
          ) : null}

          {selectedMetric &&
          statisticalInformationPerMetric.hasOwnProperty(
            selectedMetric.name,
          ) ? (
            <div className={classes.row}>
              <div
                key={`statisticalInformation-metric-${selectedMetric.name}--${hash(JSON.stringify(statisticalInformationPerMetric[selectedMetric.name]))}`}
                className={classes.performanceInformation}
              >
                <h5>
                  <strong>{extractMetricDisplayName(selectedMetric)}</strong>
                </h5>
                <Tile className={classes.tile}>
                  <div className={classes.tileContent}>
                    <span className={classes.tileContentInformation}>
                      p-value
                    </span>
                    <span
                      className={classes.tileContentValue}
                      suppressHydrationWarning={true}
                    >
                      {statisticalInformationPerMetric[selectedMetric.name][
                        'p'
                      ].toFixed(4)}
                    </span>
                    <span
                      className={classes.tileContentDecision}
                      suppressHydrationWarning={true}
                    >
                      {statisticalInformationPerMetric[selectedMetric.name][
                        'p'
                      ] <= 0.05
                        ? 'Significant'
                        : 'Not significant'}
                    </span>
                  </div>
                </Tile>
                <ScatterChart
                  ref={chartRef}
                  data={prepareScatterPlotData(
                    modelA.name,
                    statisticalInformationPerMetric[selectedMetric.name]
                      .distributionA,
                    modelB.name,
                    statisticalInformationPerMetric[selectedMetric.name]
                      .distributionB,
                    statisticalInformationPerMetric[selectedMetric.name]
                      .taskIds,
                  )}
                  options={{
                    axes: {
                      left: {
                        mapsTo: 'value',
                        ...(selectedMetric.type === 'numerical' &&
                          typeof selectedMetric.minValue === 'number' &&
                          typeof selectedMetric.maxValue === 'number' && {
                            domain: [
                              selectedMetric.minValue,
                              selectedMetric.maxValue,
                            ],
                          }),
                        ...(selectedMetric.type === 'categorical' &&
                          typeof selectedMetric.minValue !== 'number' &&
                          typeof selectedMetric.maxValue !== 'number' && {
                            domain: [
                              castToNumber(
                                selectedMetric.minValue?.value || 0,
                                selectedMetric.values,
                              ),
                              castToNumber(
                                selectedMetric.maxValue?.value || 4,
                                selectedMetric.values,
                              ),
                            ],
                          }),
                        title: extractMetricDisplayName(selectedMetric),
                      },
                      bottom: {
                        mapsTo: 'key',
                        ticks: {
                          values: [],
                        },
                        title: `Tasks (${
                          statisticalInformationPerMetric[selectedMetric.name]
                            .distributionA.length
                        }/${
                          resultsPerMetric[selectedMetric.name].length /
                          models.length
                        })`,
                      },
                    },
                    width: `${Math.round(windowWidth * 0.8)}px`,
                    height: '500px',
                    toolbar: {
                      enabled: false,
                    },
                    color: {
                      scale: modelColors,
                    },
                    legend: {
                      order: modelOrder,
                    },
                    theme: theme,
                  }}
                ></ScatterChart>
              </div>
            </div>
          ) : (
            <>
              <div className={classes.tasksContainerNotification}>
                <span
                  className={classes.tasksContainerNotificationText}
                >{`Press calculate to measure statistical significance ${selectedMetric ? 'for' : 'across'} "${selectedMetric ? extractMetricDisplayName(selectedMetric) : 'all'}" metric${selectedMetric ? '' : 's'}`}</span>
                <span
                  className={classes.tasksContainerNotificationText}
                >{`for "${modelA.name}" and "${modelB.name}" models.`}</span>
                {complexity === 'high' ? (
                  <div className={classes.tasksContainerWarning}>
                    <WarningAlt
                      height={'24px'}
                      width={'24px'}
                      className={classes.tasksContainerWarningIcon}
                    />
                    <span className={classes.tasksContainerWarningText}>
                      It might take few minutes to build this view.
                    </span>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className={classes.tasksContainerNotification}>
            <span
              className={classes.tasksContainerNotificationText}
            >{`Press calculate to measure statistical significance ${selectedMetric ? 'for' : 'across'} "${selectedMetric ? extractMetricDisplayName(selectedMetric) : 'all'}" metric${selectedMetric ? '' : 's'}`}</span>
            <span
              className={classes.tasksContainerNotificationText}
            >{`for "${modelA.name}" and "${modelB.name}" models.`}</span>
            {complexity === 'high' ? (
              <div className={classes.tasksContainerWarning}>
                <WarningAlt
                  height={'24px'}
                  width={'24px'}
                  className={classes.tasksContainerWarningIcon}
                />
                <span className={classes.tasksContainerWarningText}>
                  It might take few minutes to build this view.
                </span>
              </div>
            ) : null}
          </div>
        </>
      )}

      {selectedMetric &&
        statisticalInformationPerMetric &&
        statisticalInformationPerMetric.hasOwnProperty(selectedMetric.name) && (
          <div className={classes.row}>
            <h4>Tasks{selectedMetric && filteredResults && <sup>*</sup>}</h4>
            {filteredResults ? (
              <>
                <TasksTable
                  metrics={[selectedMetric]}
                  results={filteredResults}
                  models={[modelA, modelB]}
                  filters={filters}
                  onClick={onTaskSelection}
                />
                <span className={classes.tasksTableWarning}>
                  <sup>*</sup> Only tasks with different model aggregate scores
                  are shown in the above table.
                </span>
              </>
            ) : null}
          </div>
        )}
    </div>
  );
}
