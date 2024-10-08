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
import Link from 'next/link';
import cx from 'classnames';
import { useState, useMemo, useEffect } from 'react';
import {
  Tag,
  FilterableMultiSelect,
  Select,
  SelectItem,
  Tooltip,
  Button,
  Toggletip,
  ToggletipButton,
  ToggletipContent,
  ToggletipActions,
} from '@carbon/react';
import {
  Information,
  WarningAlt,
  Filter,
  ChevronDown,
  ChevronUp,
} from '@carbon/icons-react';
import { GroupedBarChart } from '@carbon/charts-react';
import { ScaleTypes } from '@carbon/charts';

import { useTheme } from '@/src/theme';
import { TaskEvaluation, Model, Metric } from '@/src/types';
import {
  AgreementLevels,
  AgreementLevelDefinitions,
  extractMetricDisplayValue,
  extractMetricDisplayName,
  bin,
  compareMetricAggregatedValues,
} from '@/src/utilities/metrics';
import { areObjectsIntersecting } from '@/src/utilities/objects';
import { getModelColorPalette } from '@/src/utilities/colors';
import { evaluate } from '@/src/utilities/expressions';
import TasksTable from '@/src/views/tasks-table/TasksTable';
import MetricSelector from '@/src/components/selectors/MetricSelector';
import Filters from '@/src/components/filters/Filters';

import '@carbon/charts-react/styles.css';
import classes from './ModelBehavior.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
type record = {
  taskId: string;
  modelName: string;
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
function compareChartData(
  a: { group: string; key: string | number; value: number },
  b: { group: string; key: string | number; value: number },
  metric: Metric,
): number {
  const { group: groupA, ...restOfA } = a;
  const { group: groupB, ...restOfB } = b;
  return compareMetricAggregatedValues(restOfA, restOfB, metric);
}

function prepareGroupBarChartData(
  data: (record & { [key: string]: string | number })[],
  metric: Metric,
) {
  const chartData: { [key: string]: { [key: string]: number } } = {};
  const totalRecordsPerModel: { [key: string]: number } = {};
  data.forEach((entry) => {
    const valueKey = Object.keys(entry).find((key) => key.endsWith('_value'));
    if (valueKey) {
      // Count entries per model
      if (totalRecordsPerModel.hasOwnProperty(entry.modelName)) {
        totalRecordsPerModel[entry.modelName] += 1;
      } else {
        totalRecordsPerModel[entry.modelName] = 1;
      }

      // Populate number of value per model
      if (chartData.hasOwnProperty(entry.modelName)) {
        const binnedValue = bin(entry[valueKey], metric);
        if (chartData[entry.modelName].hasOwnProperty(binnedValue)) {
          chartData[entry.modelName][binnedValue] += 1;
        } else {
          chartData[entry.modelName][binnedValue] = 1;
        }
      } else {
        chartData[entry.modelName] = { [bin(entry[valueKey], metric)]: 1 };
      }
    }
  });

  const temp: any[] = [];
  for (const [model, distribution] of Object.entries(chartData)) {
    for (const [value, count] of Object.entries(distribution)) {
      temp.push({
        group: model,
        key: value,
        value:
          Math.round(
            ((count / totalRecordsPerModel[model]) * 100 + Number.EPSILON) *
              100,
          ) / 100,
      });
    }
  }

  return temp
    .sort((a, b) => compareChartData(a, b, metric))
    .map((entry) => {
      return {
        ...entry,
        key:
          metric.aggregator && metric.aggregator === 'majority'
            ? extractMetricDisplayValue(entry.key, metric.values)
            : entry.key,
      };
    });
}

function process(
  evaluationsPerMetric: { [key: string]: TaskEvaluation[] },
  selectedAgreementLevels: { [key: string]: number | string }[],
  selectedModels: Model[],
  selectedMetric: Metric | undefined,
  selectedAllowedValues: string[],
  selectedAnnotator: string | undefined,
  filters: { [key: string]: string[] },
  expression?: object,
): [(record & { [key: string]: string | number })[], TaskEvaluation[]] {
  // Step 1: Initialize necessary variables
  const models = selectedModels.reduce(
    (obj, item) => ((obj[item.modelId] = item), obj),
    {},
  );
  const records: (record & { [key: string]: string | number })[] = [];
  const visibleEvaluations: TaskEvaluation[] = [];

  // Step 2: If filters are specified
  const filteredEvaluationsPerMetric: { [key: string]: TaskEvaluation[] } = {};
  for (const [metric, evals] of Object.entries(evaluationsPerMetric)) {
    filteredEvaluationsPerMetric[metric] = !isEmpty(filters)
      ? evals.filter((e) => areObjectsIntersecting(filters, e))
      : evals;
  }

  // Step 3: If a metric is selected
  if (selectedMetric) {
    // Step 3.a: If an expression is specified
    if (expression && !isEmpty(expression)) {
      // Step 3.a.ii: Build an object containing evaluations per model for every task
      const evaluationsPerTaskPerModel: {
        [key: string]: { [key: string]: TaskEvaluation };
      } = {};
      filteredEvaluationsPerMetric[selectedMetric.name].forEach(
        (evaluation) => {
          if (evaluationsPerTaskPerModel.hasOwnProperty(evaluation.taskId)) {
            evaluationsPerTaskPerModel[evaluation.taskId][evaluation.modelId] =
              evaluation;
          } else {
            evaluationsPerTaskPerModel[evaluation.taskId] = {
              [evaluation.modelId]: evaluation,
            };
          }
        },
      );

      // Step 3.a.iii: Find evaluations meeting expression criteria
      evaluate(
        evaluationsPerTaskPerModel,
        expression,
        selectedMetric,
        selectedAnnotator,
      ).forEach((evaluation) => {
        // Step 3.a.iii.*: Create and add record
        records.push({
          taskId: evaluation.taskId,
          modelName: models[evaluation.modelId].name,
          [`${selectedMetric.name}_value`]:
            evaluation[`${selectedMetric.name}_agg`].value,
          [`${selectedMetric.name}_aggLevel`]:
            evaluation[`${selectedMetric.name}_agg`].level,
        });

        // Step 3.a.iii.**: Add evaluation
        visibleEvaluations.push(evaluation);
      });
    } else {
      // Step 3.b: Filter evaluations for the selected metric
      filteredEvaluationsPerMetric[selectedMetric.name].forEach(
        (evaluation) => {
          // Step 3.b.i: If individual annotator is selected, verify against annotator's value
          if (selectedAnnotator) {
            /**
             * Evaluation's model id fall within selected models
             * OR
             * Evaluation's selected metric's value fall within allowed values
             */
            if (
              evaluation.modelId in models &&
              evaluation[selectedMetric.name].hasOwnProperty(
                selectedAnnotator,
              ) &&
              (!selectedAllowedValues.length ||
                selectedAllowedValues.includes(
                  evaluation[selectedMetric.name][selectedAnnotator].value,
                ))
            ) {
              // Step 3.b.i.*: Create and add record
              records.push({
                taskId: evaluation.taskId,
                modelName: models[evaluation.modelId].name,
                [`${selectedMetric.name}_value`]:
                  evaluation[selectedMetric.name][selectedAnnotator].value,
              });

              // Step 3.b.i.**: Add evaluation
              visibleEvaluations.push(evaluation);
            }
          } else {
            // Step 3.b.ii: Verify against aggregate value
            if (
              evaluation.modelId in models &&
              selectedAgreementLevels
                .map((level) => level.value)
                .includes(evaluation[`${selectedMetric.name}_agg`].level) &&
              (!selectedAllowedValues.length ||
                selectedAllowedValues.includes(
                  evaluation[`${selectedMetric.name}_agg`].value,
                ))
            ) {
              // Step 3.b.ii.*: Create and add record
              records.push({
                taskId: evaluation.taskId,
                modelName: models[evaluation.modelId].name,
                [`${selectedMetric.name}_value`]:
                  evaluation[`${selectedMetric.name}_agg`].value,
                [`${selectedMetric.name}_aggLevel`]:
                  evaluation[`${selectedMetric.name}_agg`].level,
              });

              // Step 3.b.ii.**: Add evaluation
              visibleEvaluations.push(evaluation);
            }
          }
        },
      );
    }
  } else {
    // Step 3: For every metric
    for (const [metric, evaluations] of Object.entries(
      filteredEvaluationsPerMetric,
    )) {
      evaluations.forEach((evaluation) => {
        // Step 3.a: If invidiual annotator is selected, verify against annotator's value
        if (selectedAnnotator) {
          /**
           * Evaluation's model id fall within selected models
           * OR
           * Evaluation's selected metric's value fall within allowed values
           */
          if (
            evaluation.modelId in models &&
            evaluation[metric].hasOwnProperty(selectedAnnotator) &&
            (!selectedAllowedValues.length ||
              selectedAllowedValues.includes(
                evaluation[metric][selectedAnnotator].value,
              ))
          ) {
            records.push({
              taskId: evaluation.taskId,
              modelName: models[evaluation.modelId].name,
              [`${metric}_value`]: evaluation[metric][selectedAnnotator].value,
            });
          }
        } else {
          // Step 3.a: Verify against aggregate value
          if (
            evaluation.modelId in models &&
            selectedAgreementLevels
              .map((level) => level.value)
              .includes(evaluation[`${metric}_agg`].level) &&
            (!selectedAllowedValues.length ||
              selectedAllowedValues.includes(evaluation[`${metric}_agg`].value))
          ) {
            records.push({
              taskId: evaluation.taskId,
              modelName: models[evaluation.modelId].name,
              [`${metric}_value`]: evaluation[`${metric}_agg`].value,
              [`${metric}_aggLevel`]: evaluation[`${metric}_agg`].level,
            });
          }
        }
      });
    }
  }

  return [records, visibleEvaluations];
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function ModelBehavior({
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
  const agreementLevels: {
    [key: string]: number | string;
  }[] = [
    { key: 'No', value: AgreementLevels.NO_AGREEMENT },
    { key: 'Low', value: AgreementLevels.LOW_AGREEMENT },
    { key: 'High', value: AgreementLevels.HIGH_AGREEMENT },
    { key: 'Absolute', value: AgreementLevels.ABSOLUTE_AGREEMENT },
  ];
  const [selectedAgreementLevels, setSelectedAgreementLevels] = useState<
    {
      [key: string]: number | string;
    }[]
  >(agreementLevels);
  const [selectedModels, setSelectedModels] = useState<Model[]>(models);
  const [selectedMetric, setSelectedMetric] = useState<Metric | undefined>(
    undefined,
  );
  const [selectedAllowedValues, setSelectedAllowedValues] = useState<string[]>(
    [],
  );
  const [selectedAnnotator, setSelectedAnnotator] = useState<
    string | undefined
  >(undefined);
  const [selectedFilters, setSelectedFilters] = useState<{
    [key: string]: string[];
  }>({});
  const [modelColors, modelOrder] = getModelColorPalette(models);
  const [expression, setExpression] = useState<object>({});
  const [graphRecords, setGraphRecords] = useState<
    (record & { [key: string]: string | number })[]
  >([]);
  const [visibleEvaluations, setVisibleEvaluations] = useState<
    TaskEvaluation[]
  >([]);

  // Step 2: Run effects
  // Step 2.a: Adjust graph width & heigh based on window size
  useEffect(() => {
    // Step 1: Define window resize function
    const handleWindowResize = () => {
      setWindowWidth(window.innerWidth);
    };

    // Step 2: Add event listener
    window.addEventListener('resize', handleWindowResize);

    // Step 3: Cleanup to remove event listener
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  // Step 2.b: Fetch theme
  const { theme } = useTheme();

  // Step 2.c: Identify all annotators
  const annotators = useMemo(() => {
    const annotatorsSet = new Set();
    const humanMetricNames = metrics
      .filter((metric) => metric.author === 'human')
      .map((metric) => metric.name);
    for (const [metric, evaluations] of Object.entries(evaluationsPerMetric)) {
      evaluations.forEach((evaluation) => {
        if (humanMetricNames.includes(metric)) {
          Object.keys(evaluation[metric]).forEach((annotator) =>
            annotatorsSet.add(annotator),
          );
        }
      });
    }

    return annotatorsSet;
  }, [evaluationsPerMetric, metrics]);

  // Step 2.d: Reset expression, if selected metric changes
  useEffect(() => {
    setExpression({});
  }, [selectedMetric]);

  // Step 2.e: Configure available majority values, if metric is selected
  const availableAllowedValues = useMemo(() => {
    if (selectedMetric && selectedMetric.type === 'categorical') {
      if (selectedAnnotator) {
        return Array.from(
          new Set(
            evaluationsPerMetric[selectedMetric.name]
              .filter(
                (evaluation) =>
                  evaluation[selectedMetric.name].hasOwnProperty(
                    selectedAnnotator,
                  ) &&
                  selectedModels
                    .map((model) => model.modelId)
                    .includes(evaluation.modelId),
              )
              .map(
                (entry) => entry[selectedMetric.name][selectedAnnotator].value,
              ),
          ),
        ).sort();
      }

      return Array.from(
        new Set(
          evaluationsPerMetric[selectedMetric.name]
            .filter(
              (evaluation) =>
                evaluation.hasOwnProperty(`${selectedMetric.name}_agg`) &&
                selectedModels
                  .map((model) => model.modelId)
                  .includes(evaluation.modelId) &&
                selectedAgreementLevels
                  .map((level) => level.value)
                  .includes(evaluation[`${selectedMetric.name}_agg`].level),
            )
            .map((entry) => entry[`${selectedMetric.name}_agg`].value),
        ),
      ).sort();
    }

    return [];
  }, [
    evaluationsPerMetric,
    selectedModels,
    selectedMetric,
    selectedAnnotator,
    selectedAgreementLevels,
  ]);

  // Step 2.f: Update selected values list
  useEffect(() => {
    setSelectedAllowedValues(availableAllowedValues);
  }, [availableAllowedValues]);

  // Step 2.g: Calculate graph data and prepare visible evaluations list
  /**
   * Adjust graph records based on selected agreement levels, models and annotator
   * visibleEvaluations : [{taskId: <>, modelId: <>, [metric]_score: <>}]
   * NOTE: * [metric]_score field avialable metrics (all OR single)
   *       * score field could be either majority score or individual annotator's score (based on selected annotator)
   */
  useEffect(() => {
    const [records, evaluations] = process(
      evaluationsPerMetric,
      selectedAgreementLevels,
      selectedModels,
      selectedMetric,
      selectedAllowedValues,
      selectedAnnotator,
      selectedFilters,
      expression,
    );

    // Set graph records and visible evaluations
    setGraphRecords(records);
    setVisibleEvaluations(evaluations);
  }, [
    evaluationsPerMetric,
    selectedAgreementLevels,
    selectedModels,
    selectedMetric,
    selectedAllowedValues,
    selectedAnnotator,
    selectedFilters,
    expression,
  ]);

  // Step 2.h: Calculate visible tasks per metric
  const visibleTasksPerMetric = useMemo(() => {
    const data = {};
    metrics.forEach((metric) => {
      data[metric.name] = new Set(
        graphRecords
          .filter((evaluation) =>
            evaluation.hasOwnProperty(`${metric.name}_value`),
          )
          .map((evaluation) => evaluation.taskId),
      ).size;
    });

    return data;
  }, [graphRecords, metrics]);

  // Step 2.i: Buckets human and algoritmic metrics into individual buckets
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

        <div className={classes.metricSelector}>
          <MetricSelector
            metrics={metrics}
            onSelect={(metric: Metric | undefined) => {
              setSelectedMetric(metric);
            }}
            warn={!selectedMetric}
          />
        </div>

        <div className={classes.agreementSelector}>
          <FilterableMultiSelect
            id={'agreement-level-selector'}
            titleText="Choose agreement level"
            helperText="Applicable to categorical metrics only"
            initialSelectedItems={selectedAgreementLevels}
            items={agreementLevels}
            itemToString={(item) => (item ? item.key : '')}
            onChange={(event) => {
              setSelectedAgreementLevels(event.selectedItems);
            }}
            invalid={selectedAgreementLevels.length === 0}
            invalidText={'You must select an agreement level to review.'}
            disabled={
              selectedAnnotator
                ? true
                : selectedMetric && selectedMetric.type != 'categorical'
            }
          ></FilterableMultiSelect>
          <div>
            {selectedAgreementLevels.map((agreementLevel, idx) => {
              return (
                <Tag
                  type={'cool-gray'}
                  key={'agreementLevel-' + agreementLevel.key}
                  disabled={
                    selectedAnnotator
                      ? true
                      : selectedMetric && selectedMetric.type != 'categorical'
                  }
                >
                  <div className={classes.tagContainer}>
                    {agreementLevel.key}
                    <Toggletip align={'bottom-left'}>
                      <ToggletipButton label="Additional information">
                        <Information />
                      </ToggletipButton>
                      <ToggletipContent>
                        <p>{AgreementLevelDefinitions[agreementLevel.key]}</p>
                        <ToggletipActions>
                          <Link
                            target="_blank"
                            rel="noopener noreferrer"
                            href="custom-link"
                          >
                            Reference
                          </Link>
                        </ToggletipActions>
                      </ToggletipContent>
                    </Toggletip>
                  </div>
                </Tag>
              );
            })}
          </div>
        </div>

        {annotators.size ? (
          <div className={classes.annotatorSelector}>
            <Select
              id={'annotator-selector'}
              labelText="Choose an annotator"
              defaultValue={'all'}
              onChange={(event) => {
                setSelectedAnnotator(
                  event.target.value !== 'all' ? event.target.value : undefined,
                );
              }}
              disabled={
                !selectedMetric ? false : selectedMetric.author !== 'human'
              }
            >
              <SelectItem key={'all-selector'} text="All" value="all" />
              {Array.from(annotators).map((annotator) => {
                return (
                  <SelectItem
                    key={`${annotator}-selector`}
                    value={annotator}
                    text={annotator}
                  ></SelectItem>
                );
              })}
            </Select>
          </div>
        ) : null}

        {selectedMetric &&
        selectedMetric.aggregator === 'majority' &&
        availableAllowedValues ? (
          <div className={classes.allowedValueSelector}>
            <FilterableMultiSelect
              key={'allowed-value-selector' + selectedAllowedValues.join('::')}
              id={'majority-value-selector'}
              titleText="Choose majority value"
              initialSelectedItems={selectedAllowedValues}
              items={availableAllowedValues}
              itemToString={(item) => {
                if (Array.isArray(item)) {
                  return item.map((entry) => {
                    extractMetricDisplayValue(entry, selectedMetric.values);
                  });
                } else if (
                  typeof item === 'string' ||
                  typeof item === 'number'
                ) {
                  return extractMetricDisplayValue(item, selectedMetric.values);
                }
              }}
              onChange={(event) => {
                setSelectedAllowedValues(event.selectedItems);
              }}
              invalid={
                selectedMetric &&
                selectedMetric.aggregator === 'majority' &&
                selectedAllowedValues.length === 0
              }
              invalidText={'You must select allowed values.'}
            ></FilterableMultiSelect>
            <div>
              {selectedAllowedValues.map((value) => {
                return (
                  <Tag type={'cool-gray'} key={'value-' + value}>
                    {extractMetricDisplayValue(value, selectedMetric.values)}
                  </Tag>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {!isEmpty(filters) ? (
        <Filters
          keyPrefix="PerformanceOverview"
          filters={filters}
          selectedFilters={selectedFilters}
          setSelectedFilters={setSelectedFilters}
          models={selectedModels}
          metric={selectedMetric}
          expression={expression}
          setExpression={setExpression}
        />
      ) : null}

      {isEmpty(graphRecords) ? (
        <div className={classes.warningContainer}>
          <WarningAlt
            height={'32px'}
            width={'32px'}
            className={classes.warningContainerIcon}
          />
          <span className={classes.warningContainerText}>
            {`No matching evaluations found. ${!isEmpty(selectedFilters) ? 'Please try again by removing one or more additional filters.' : ''}`}
          </span>
        </div>
      ) : null}
      {!isEmpty(graphRecords) && !selectedMetric && humanMetrics.length ? (
        <div className={classes.row}>
          <h4>Human Evaluations</h4>
          <div
            className={cx(
              humanMetrics.length > 3 ? classes.graphsGrid : classes.graphsFlex,
            )}
          >
            {humanMetrics.map((metric) => {
              return (
                <div key={'metric-' + metric.name} className={classes.graph}>
                  <h5 className={classes.graphTitle}>
                    <strong>{extractMetricDisplayName(metric)}</strong>
                    <span>{`(${visibleTasksPerMetric[metric.name]}/${
                      evaluationsPerMetric[metric.name].length / models.length
                    })`}</span>
                  </h5>
                  <GroupedBarChart
                    data={prepareGroupBarChartData(
                      graphRecords.filter((evaluation) =>
                        evaluation.hasOwnProperty(`${metric.name}_value`),
                      ),
                      metric,
                    )}
                    options={{
                      axes: {
                        left: {
                          mapsTo: 'value',
                          ticks: {
                            formatter: (tick) => tick + '%',
                          },
                          domain: [0, 100],
                        },
                        bottom: {
                          scaleType: ScaleTypes.LABELS,
                          mapsTo: 'key',
                        },
                      },
                      width:
                        humanMetrics.length == 1
                          ? `${Math.round(WindowWidth * 0.5)}px`
                          : '500px',
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
                  ></GroupedBarChart>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!isEmpty(graphRecords) && !selectedMetric && algorithmMetrics.length ? (
        <div className={classes.row}>
          <h4>Algorithmic Evaluations</h4>
          <div
            className={cx(
              algorithmMetrics.length > 3
                ? classes.graphsGrid
                : classes.graphsFlex,
            )}
          >
            {algorithmMetrics.map((metric) => {
              return (
                <div key={'metric-' + metric.name} className={classes.graph}>
                  <h5 className={classes.graphTitle}>
                    <strong>{extractMetricDisplayName(metric)}</strong>
                    <span>{`(${visibleTasksPerMetric[metric.name]}/${
                      evaluationsPerMetric[metric.name].length / models.length
                    })`}</span>
                  </h5>
                  <GroupedBarChart
                    data={prepareGroupBarChartData(
                      graphRecords.filter((evaluation) =>
                        evaluation.hasOwnProperty(`${metric.name}_value`),
                      ),
                      metric,
                    )}
                    options={{
                      axes: {
                        left: {
                          mapsTo: 'value',
                          ticks: {
                            formatter: (tick) => tick + '%',
                          },
                          domain: [0, 100],
                        },
                        bottom: {
                          scaleType: ScaleTypes.LABELS,
                          mapsTo: 'key',
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
                  ></GroupedBarChart>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!isEmpty(graphRecords) && selectedMetric ? (
        <div className={classes.graph}>
          <h5 className={classes.graphTitle}>
            <strong>{extractMetricDisplayName(selectedMetric)}</strong>
            <span>{`(${visibleTasksPerMetric[selectedMetric.name]}/${
              evaluationsPerMetric[selectedMetric.name].length / models.length
            })`}</span>
          </h5>
          <GroupedBarChart
            data={prepareGroupBarChartData(
              graphRecords.filter((evaluation) =>
                evaluation.hasOwnProperty(`${selectedMetric.name}_value`),
              ),
              selectedMetric,
            )}
            options={{
              axes: {
                left: {
                  mapsTo: 'value',
                  ticks: {
                    formatter: (tick) => tick + '%',
                  },
                  domain: [0, 100],
                },
                bottom: {
                  scaleType: ScaleTypes.LABELS,
                  mapsTo: 'key',
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
          ></GroupedBarChart>
        </div>
      ) : null}

      {selectedMetric && !isEmpty(visibleEvaluations) ? (
        <div className={classes.row}>
          <h4>Tasks</h4>
          <TasksTable
            metrics={[selectedMetric]}
            evaluations={visibleEvaluations}
            models={selectedModels}
            filters={filters}
            annotator={selectedAnnotator}
            onClick={(taskId) => {
              onTaskSelection(taskId);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
