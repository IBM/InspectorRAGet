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

import { countBy, isEmpty } from 'lodash';
import cx from 'classnames';
import { useState, useMemo, useEffect, useRef } from 'react';
import { Tile, Button, Slider } from '@carbon/react';
import { WarningAlt } from '@carbon/icons-react';
import { ScatterChart } from '@carbon/charts-react';

import { useTheme } from '@/src/theme';
import { Model, Metric, TaskEvaluation } from '@/src/types';
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

// ===================================================================================
//                                TYPES
// ===================================================================================

type StatisticalInformation = {
  p: number;
  distributionA: number[];
  meanA: number;
  distributionB: number[];
  meanB: number;
  taskIds?: string[];
};

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
 * Build an array containing evaluations only for selected models for each task.
 *
 * Eligbility criteria:
 *
 * 1. Must have evaluations for both selected models
 *
 * 2. Each evaluation must have an agreement value for selected metric
 *
 *
 * @param evaluations evaluations for all task
 * @param modelA selected model
 * @param modelB selected model
 * @param metric selected metric
 * @returns
 */
function extractEvaluationsPerTask(
  evaluations: TaskEvaluation[],
  modelA: Model,
  modelB: Model,
  metric: string,
  selectedFilters: { [key: string]: string[] },
  selectedMetricRange?: number[],
) {
  // Step 1: Initiaze necessary variable
  const modelEvaluationsPerTask: { [key: string]: TaskEvaluation[] } = {};

  // Step 2: Add to model evaluations for a task, if evaluation meets eligbility criteria
  evaluations.forEach((evaluation) => {
    if (
      (evaluation.modelId === modelA.modelId ||
        evaluation.modelId === modelB.modelId) &&
      evaluation[`${metric}_agg`].level !== AgreementLevels.NO_AGREEMENT &&
      (!isEmpty(selectedFilters)
        ? areObjectsIntersecting(selectedFilters, evaluation)
        : true)
    ) {
      const modelEvaluationsForTask =
        modelEvaluationsPerTask[evaluation.taskId];
      if (modelEvaluationsForTask) {
        modelEvaluationsForTask.push(evaluation);
      } else {
        modelEvaluationsPerTask[evaluation.taskId] = [evaluation];
      }
    }
  });

  // Step 3: Retain only those task which has evaluations for both models
  //         and one or more models have aggregate value in the selected range
  return Object.values(modelEvaluationsPerTask).filter(
    (entry) =>
      entry.length == 2 &&
      (selectedMetricRange
        ? (entry[0][`${metric}_agg`].value >= selectedMetricRange[0] &&
            entry[0][`${metric}_agg`].value <= selectedMetricRange[1]) ||
          (entry[1][`${metric}_agg`].value >= selectedMetricRange[0] &&
            entry[1][`${metric}_agg`].value <= selectedMetricRange[1])
        : true),
  );
}

/**
 * Run statistical significance test based on Fisher randomization method.
 * @param evaluationsPerMetric evaluations per metric
 * @param metrics metrics
 * @param modelA selected model
 * @param modelB selected model
 * @param selectedMetric If `undefined`, run for all metrics in `evaluationsPerMetric` object
 * @returns
 */
function runStatisticalSignificanceTest(
  evaluationsPerMetric: { [key: string]: TaskEvaluation[] },
  metrics: Metric[],
  modelA: Model,
  modelB: Model,
  selectedMetric: Metric | undefined,
  selectedFilters: { [key: string]: string[] },
  selectedMetricRange?: number[],
) {
  // Step 1: Initialize necessary variables
  const evaluationsPerMetricPerTask: { [key: string]: TaskEvaluation[][] } = {};

  // Step 2: Retain evaluations for tasks where both models have agreement value
  if (selectedMetric) {
    const evaluationsPerTask = extractEvaluationsPerTask(
      evaluationsPerMetric[selectedMetric.name],
      modelA,
      modelB,
      selectedMetric.name,
      selectedFilters,
      selectedMetricRange,
    );

    if (evaluationsPerTask.length !== 0) {
      evaluationsPerMetricPerTask[selectedMetric.name] = evaluationsPerTask;
    }
  } else {
    Object.keys(evaluationsPerMetric).forEach((metric) => {
      const evaluationsPerTask = extractEvaluationsPerTask(
        evaluationsPerMetric[metric],
        modelA,
        modelB,
        metric,
        selectedFilters,
        selectedMetricRange,
      );
      if (evaluationsPerTask.length !== 0) {
        evaluationsPerMetricPerTask[metric] = evaluationsPerTask;
      }
    });
  }

  // Step 3: Compute model value distribution for every metric
  const distributionA: { [key: string]: number[] } = {};
  const distributionB: { [key: string]: number[] } = {};
  const taskIds: { [key: string]: string[] } = {};

  Object.keys(evaluationsPerMetricPerTask).forEach((metric) => {
    const metricValues = metrics.find((entry) => entry.name === metric)?.values;
    taskIds[metric] = evaluationsPerMetricPerTask[metric].map(
      (entry) => entry[0].taskId,
    );

    distributionA[metric] = evaluationsPerMetricPerTask[metric].map((entry) =>
      castToNumber(
        entry[0].modelId === modelA.modelId
          ? entry[0][`${metric}_agg`].value
          : entry[1][`${metric}_agg`].value,
        metricValues,
      ),
    );

    distributionB[metric] = evaluationsPerMetricPerTask[metric].map((entry) =>
      castToNumber(
        entry[1].modelId === modelB.modelId
          ? entry[1][`${metric}_agg`].value
          : entry[0][`${metric}_agg`].value,
        metricValues,
      ),
    );
  });

  // Step 3: Compute p value and means for every metric by comparing distributions
  const information: { [key: string]: StatisticalInformation } = {};
  Object.keys(evaluationsPerMetricPerTask).forEach((metric) => {
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

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
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

  // Step 2: Collate model wise predictions per task
  const distributions: { values: number[]; taskId: string }[] = [];
  distributionA.forEach((valueA, index) => {
    distributions.push({
      taskId: taskIds ? taskIds[index] : `${index}`,
      values: [valueA, distributionB[index]],
    });
  });

  // Step 3: Primary sort based on model A's value
  distributions.sort((a, b) => a.values[0] - b.values[0]);

  // Step 4: Scondary sort based on Model B's value
  distributions.sort((a, b) => a.values[1] - b.values[1]);

  // Step 5: Prepare chart data
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
  numEvaluations: number,
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
                }/${numEvaluations})`,
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

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function ModelComparator({
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

  // Step 2: Run effects
  // Step 2.a: Window resizing
  useEffect(() => {
    const handleWindowResize = () => {
      setWindowWidth(window.innerWidth);
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

  //Step 2.c: Bucket human and algoritmic metrics
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

  // Step 2.d: Reset selected metric range, only applicable for numerical metrics
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

  // Step 2.e: Identify visible evaluations
  const filteredEvaluations = useMemo(() => {
    if (selectedMetric) {
      // Step 1: Identify evaluations for selected models
      const evaluationsForSelectedModels = evaluationsPerMetric[
        selectedMetric.name
      ].filter(
        (evaluation) =>
          (evaluation.modelId === modelA.modelId ||
            evaluation.modelId === modelB.modelId) &&
          (!isEmpty(selectedFilters)
            ? areObjectsIntersecting(selectedFilters, evaluation)
            : true),
      );

      // Step 2: Collate evaluation per task id
      const evaluationsPerTask: { [key: string]: { [key: string]: number } } =
        {};
      evaluationsForSelectedModels.forEach((evaluation) => {
        const entry = evaluationsPerTask[evaluation.taskId];
        if (entry) {
          entry[evaluation.modelId] =
            evaluation[`${selectedMetric.name}_agg`].value;
        } else {
          evaluationsPerTask[evaluation.taskId] = {
            [evaluation.modelId]:
              evaluation[`${selectedMetric.name}_agg`].value,
          };
        }
      });

      // Step 3: Only select evaluation tasks where models aggregate values differe
      //         and one or more models have aggregate value in the selected range
      const visibleEvaluationTaskIds = Object.keys(evaluationsPerTask).filter(
        (taskId) =>
          Object.keys(countBy(Object.values(evaluationsPerTask[taskId])))
            .length > 1 &&
          (selectedMetricRange
            ? (Object.values(evaluationsPerTask[taskId])[0] >=
                selectedMetricRange[0] &&
                Object.values(evaluationsPerTask[taskId])[0] <=
                  selectedMetricRange[1]) ||
              (Object.values(evaluationsPerTask[taskId])[1] >=
                selectedMetricRange[0] &&
                Object.values(evaluationsPerTask[taskId])[1] <=
                  selectedMetricRange[1])
            : true),
      );

      // Step 4: Return evaluations for selected evaluation tasks where models aggregate values differe
      return evaluationsForSelectedModels.filter((evaluation) =>
        visibleEvaluationTaskIds.includes(evaluation.taskId),
      );
    }
    return [];
  }, [
    evaluationsPerMetric,
    selectedMetric,
    modelA,
    modelB,
    selectedMetricRange,
  ]);

  // Step 2.f: Reset statistical information, if either of model changes or filters are changed
  useEffect(() => {
    setStatisticalInformationPerMetric(undefined);
  }, [modelA, modelB, selectedFilters]);

  // Step 2.g: Recalculate statistical information, if metric changes
  useEffect(() => {
    if (
      !selectedMetric &&
      statisticalInformationPerMetric &&
      Object.keys(statisticalInformationPerMetric).length == 1
    ) {
      setStatisticalInformationPerMetric(
        runStatisticalSignificanceTest(
          evaluationsPerMetric,
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
          evaluationsPerMetric,
          metrics,
          modelA,
          modelB,
          selectedMetric,
          selectedFilters,
          selectedMetricRange,
        ),
      );
    }
  }, [selectedMetric, selectedMetricRange]);

  // Step 2.h: Compute computation complexity
  const complexity = useMemo(() => {
    let size = 0;
    if (selectedMetric) {
      size = evaluationsPerMetric[selectedMetric.name].length / models.length;
    } else {
      size = Object.values(evaluationsPerMetric)
        .map((evaluations) => evaluations.length / models.length)
        .reduce((a, b) => a + b, 0);
    }

    if (size > 1000) {
      return 'high';
    }
    return 'low';
  }, [evaluationsPerMetric, selectedMetric]);

  // Step 2.i: Add chart event
  useEffect(() => {
    // Step 2.i.*: Local copy of reference
    let ref = null;

    // Step 2.i.**: Update reference and add event
    if (chartRef && chartRef.current) {
      ref = chartRef.current;

      //@ts-ignore
      ref.chart.services.events.addEventListener(
        'scatter-click',
        ({ detail }) => {
          onTaskSelection(detail.datum.taskId);
        },
      );
    }

    // Step 2.i.***: Cleanup function
    return () => {
      if (ref) {
        //@ts-ignore
        ref.chart.services.events.removeEventListener(
          'scatter-click',
          ({ detail }) => {
            onTaskSelection(detail.datum.taskId);
          },
        );
      }
    };
  }, [chartRef, selectedMetric, statisticalInformationPerMetric]);

  // Step 3: Render
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
                  evaluationsPerMetric,
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
                    evaluationsPerMetric[metric.name].length / models.length,
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
                    evaluationsPerMetric[metric.name].length / models.length,
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
                          evaluationsPerMetric[selectedMetric.name].length /
                          models.length
                        })`,
                      },
                    },
                    width: `${Math.round(WindowWidth * 0.8)}px`,
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
            <h4>
              Tasks{selectedMetric && filteredEvaluations && <sup>*</sup>}
            </h4>
            {filteredEvaluations ? (
              <>
                <TasksTable
                  metrics={[selectedMetric]}
                  evaluations={filteredEvaluations}
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
