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
import cx from 'classnames';
import { useState, useMemo, useEffect } from 'react';
import {
  Tag,
  FilterableMultiSelect,
  Select,
  SelectItem,
  DefinitionTooltip,
  Loading,
} from '@carbon/react';
import { WarningAlt } from '@carbon/icons-react';
import { GroupedBarChart } from '@carbon/charts-react';
import { ScaleTypes } from '@carbon/charts';

import { useTheme } from '@/src/theme';
import { ModelResult, Model, Metric, FilterationResponse } from '@/src/types';
import {
  AgreementLevels,
  AgreementLevelDefinitions,
  extractMetricDisplayValue,
  extractMetricDisplayName,
  bin,
  compareMetricAggregatedValues,
} from '@/src/utilities/metrics';
import { getModelColorPalette } from '@/src/utilities/colors';
import TasksTable from '@/src/views/tasks-table/TasksTable';
import MetricSelector from '@/src/components/selectors/MetricSelector';
import Filters from '@/src/components/filters/Filters';

import '@carbon/charts-react/styles.css';
import classes from './ModelBehavior.module.scss';

// --- Types ---

type record = {
  taskId: string;
  modelName: string;
};

interface Props {
  resultsPerMetric: { [key: string]: ModelResult[] };
  models: Model[];
  metrics: Metric[];
  filters: { [key: string]: string[] };
  onTaskSelection: Function;
}

// --- Compute functions ---

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
          metric.aggregator &&
          (metric.aggregator === 'majority' || metric.aggregator === 'median')
            ? extractMetricDisplayValue(entry.key, metric.values)
            : entry.key,
      };
    });
}

// --- Main component ---

export default function ModelBehavior({
  resultsPerMetric,
  models,
  metrics,
  filters,
  onTaskSelection,
}: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  const [windowWidth, setWindowWidth] = useState<number>(
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
  const [selectedAllowedValues, setSelectedAllowedValues] =
    useState<string[]>();
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
  const [visibleResults, setVisibleResults] = useState<ModelResult[]>([]);
  const [filterationWorker, setFilterationWorker] = useState<Worker>();

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

  // Initialize a Web Worker for background data filtering
  useEffect(() => {
    const worker = new Worker(
      new URL('../../workers/filter.ts', import.meta.url),
    );

    worker.onmessage = function (event: MessageEvent<FilterationResponse>) {
      const { records, results } = event.data;
      setGraphRecords(records);
      setVisibleResults(results);
      setLoading(false);
    };

    setFilterationWorker(worker);

    return () => {
      worker.terminate();
    };
  }, []);

  const annotators = useMemo(() => {
    const annotatorsSet = new Set();
    const humanMetricNames = metrics
      .filter((metric) => metric.author === 'human')
      .map((metric) => metric.name);
    for (const [metric, results] of Object.entries(resultsPerMetric)) {
      results.forEach((evaluation) => {
        if (humanMetricNames.includes(metric)) {
          Object.keys(evaluation[metric]).forEach((annotator) =>
            annotatorsSet.add(annotator),
          );
        }
      });
    }

    return annotatorsSet;
  }, [resultsPerMetric, metrics]);

  // Reset expression when selected metric changes
  useEffect(() => {
    setExpression({});
  }, [selectedMetric]);

  const availableAllowedValues = useMemo(() => {
    if (selectedMetric && selectedMetric.type === 'categorical') {
      if (selectedAnnotator) {
        return Array.from(
          new Set(
            resultsPerMetric[selectedMetric.name]
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
          resultsPerMetric[selectedMetric.name]
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

    return undefined;
  }, [
    resultsPerMetric,
    selectedModels,
    selectedMetric,
    selectedAnnotator,
    selectedAgreementLevels,
  ]);

  useEffect(() => {
    setSelectedAllowedValues(availableAllowedValues);
  }, [availableAllowedValues]);

  /**
   * Adjust graph records based on selected agreement levels, models and annotator
   * visibleResults : [{taskId: <>, modelId: <>, [metric]_score: <>}]
   * NOTE: * [metric]_score field avialable metrics (all OR single)
   *       * score field could be either majority score or individual annotator's score (based on selected annotator)
   */
  useEffect(() => {
    setLoading(true);

    // Delegate filtering to Web Worker to keep the main thread responsive
    if (filterationWorker) {
      filterationWorker.postMessage({
        resultsPerMetric: resultsPerMetric,
        filters: selectedFilters,
        models: selectedModels,
        expression: expression,
        agreementLevels: selectedAgreementLevels,
        metric: selectedMetric,
        allowedValues: selectedAllowedValues,
        annotator: selectedAnnotator,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterationWorker is a stable Web Worker instance; including it would not change behavior
  }, [
    resultsPerMetric,
    selectedAgreementLevels,
    selectedModels,
    selectedMetric,
    selectedAllowedValues,
    selectedAnnotator,
    selectedFilters,
    expression,
  ]);

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

  return (
    <div className={classes.page}>
      {loading ? <Loading small withOverlay={false} /> : null}
      <div className={classes.selectors}>
        <div className={classes.modelSelector}>
          <FilterableMultiSelect
            id={'model-behavior-model-selector'}
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
            selectedItems={selectedAgreementLevels}
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
              const disabled = selectedAnnotator
                ? true
                : selectedMetric && selectedMetric.type != 'categorical';
              return (
                <span
                  key={'agreementLevel-' + agreementLevel.key}
                  className={cx(classes.agreementTag, {
                    [classes.agreementTagDisabled]: disabled,
                  })}
                >
                  <DefinitionTooltip
                    definition={AgreementLevelDefinitions[agreementLevel.key]}
                    align={'bottom'}
                    openOnHover={true}
                    autoAlign={true}
                  >
                    {agreementLevel.key}
                  </DefinitionTooltip>
                </span>
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
        selectedMetric.type === 'categorical' &&
        (selectedMetric.aggregator === 'majority' ||
          selectedMetric.aggregator === 'median') &&
        availableAllowedValues &&
        selectedAllowedValues ? (
          <div className={classes.allowedValueSelector}>
            <FilterableMultiSelect
              id={'majority-value-selector'}
              titleText="Choose majority value"
              selectedItems={selectedAllowedValues}
              items={availableAllowedValues}
              itemToString={(item) => {
                if (item === null || item === undefined) return '';
                if (typeof item === 'string' || typeof item === 'number') {
                  return extractMetricDisplayValue(item, selectedMetric.values);
                }
                return String(item);
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
            <div className={classes.tagList}>
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
          keyPrefix="ModelBehavior"
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
                      resultsPerMetric[metric.name].length / models.length
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
                        humanMetrics.length === 1
                          ? `${Math.round(windowWidth * 0.5)}px`
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
                      resultsPerMetric[metric.name].length / models.length
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
              resultsPerMetric[selectedMetric.name].length / models.length
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
          ></GroupedBarChart>
        </div>
      ) : null}

      {selectedMetric && !isEmpty(visibleResults) ? (
        <div className={classes.row}>
          <h4>Tasks</h4>
          <TasksTable
            metrics={[selectedMetric]}
            results={visibleResults}
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
