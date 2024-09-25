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

import { groupBy, isEmpty } from 'lodash';
import cx from 'classnames';
import { useState, useEffect, useMemo } from 'react';
import {
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
} from '@carbon/react';
import { WarningAlt } from '@carbon/icons-react';
import {
  SimpleBarChart,
  RadarChart,
  GroupedBarChart,
} from '@carbon/charts-react';
import { Alignments, ScaleTypes } from '@carbon/charts';

import { useTheme } from '@/src/theme';
import {
  AggregationConfidenceLevels,
  AggregationStatistics,
  Aggregator,
  Metric,
  Model,
  TaskEvaluation,
} from '@/src/types';
import {
  extractMetricDisplayName,
  castToNumber,
} from '@/src/utilities/metrics';
import {
  averageAggregator,
  majorityAggregator,
} from '@/src/utilities/aggregators';
import { areObjectsIntersecting } from '@/src/utilities/objects';
import { getModelColorPalette } from '@/src/utilities/colors';
import AggregatorSelector from '@/src/components/selectors/AggregatorSelector';
import Filters from '@/src/components/filters/Filters';
import FilterMetrics from '@/src/views/performance-overview/FilterMetrics';

import '@carbon/charts-react/styles.css';
import classes from './PerformanceOverview.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  evaluationsPerMetric: { [key: string]: TaskEvaluation[] };
  models: Model[];
  metrics: Metric[];
  filters: { [key: string]: string[] };
  numTasks: number;
}

// ===================================================================================
//                               COMPUTE FUNCTIONS
// ===================================================================================
function calculateRanks(
  data: {
    model: string;
    metric: string;
    score: number;
    rank: number;
    std?: number;
    order?: 'ascending' | 'descending';
    levels: { low: number; medium: number; high: number };
  }[],
) {
  const peformancePerMetric: {
    [key: string]: {
      model: string;
      score: number;
      rank: number;
      std?: number;
    }[];
  } = {};
  const order: { [key: string]: 'ascending' | 'descending' } = {};
  for (const entry of data) {
    if (peformancePerMetric.hasOwnProperty(entry.metric)) {
      peformancePerMetric[entry.metric].push(entry);
    } else {
      peformancePerMetric[entry.metric] = [entry];
    }

    if (!order.hasOwnProperty(entry.metric)) {
      order[entry.metric] = entry.order ? entry.order : 'ascending';
    }
  }
  for (const [metric, performance] of Object.entries(peformancePerMetric)) {
    performance.sort((a, b) => {
      if (order[metric] == 'ascending') {
        return a.score > b.score ? -1 : 1;
      } else {
        return a.score > b.score ? 1 : -1;
      }
    });
    let rank = 0;
    performance.forEach((entry, idx) => {
      if (idx !== 0 && entry.score === performance[idx - 1].score) {
        entry['rank'] = rank;
      } else {
        entry['rank'] = rank + 1;
        rank += 1;
      }
    });
  }
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function sparkline(
  distribution: { [key: string]: number } | undefined,
  theme?: string,
) {
  if (distribution === undefined) {
    return null;
  } else {
    return (
      <SimpleBarChart
        data={Object.entries(distribution).map(([value, count]) => {
          return { group: value, value: count };
        })}
        options={{
          color: {
            scale: { low: '#fa4d56', medium: '#f1c21b', high: '#42be65' },
          },
          axes: {
            left: {
              mapsTo: 'value',
              visible: false,
              scaleType: ScaleTypes.LINEAR,
            },
            bottom: {
              mapsTo: 'group',
              visible: false,
              scaleType: ScaleTypes.LABELS,
            },
          },
          grid: {
            y: {
              enabled: false,
            },
            x: {
              enabled: false,
            },
          },
          legend: {
            enabled: false,
          },
          toolbar: {
            enabled: false,
          },
          theme: theme,
          height: '24px',
          width: '48px',
        }}
      ></SimpleBarChart>
    );
  }
}

function drawTable(
  data: {
    model: string;
    metric: string;
    score: number;
    rank: number;
    std?: number;
    levels: { low: number; medium: number; high: number };
  }[],
  metrics: string[],
  plot: boolean = false,
  theme?: string,
) {
  // Step 1: Define headers
  const headers = [
    { key: 'model', header: 'Model' },
    ...metrics.map((metric) => {
      return { key: metric, header: metric };
    }),
    { key: 'rank', header: 'Rank' },
  ];

  // Step 2: Group data per model
  const dataPerModel: {
    [key: string]: {
      model: string;
      metric: string;
      score: number;
      rank: number;
      std?: number;
    }[];
  } = groupBy(data, (entry) => entry.model);

  // Step 3: Compute overall rank
  const overallRank: [string, number][] = Object.entries(dataPerModel).map(
    ([model, entry]) => [model, entry.reduce((n, { rank }) => n + rank, 0)],
  );

  // Step 4: Sort based on overall rank, if necessary
  if (overallRank.length > 1) {
    overallRank.sort((a, b) => {
      return a[1] - b[1];
    });
  }

  // Step 5: Define distribution map
  const distributions = new Map(
    data.map((entry) => [`${entry.model}:${entry.metric}`, entry.levels]),
  );

  // Step 5: Define rows
  const rows: { [key: string]: string }[] = [];
  overallRank.forEach(([model, sum], index) => {
    rows.push({
      id: model,
      model: model,
      ...Object.fromEntries(
        dataPerModel[model].map((record) => [
          record.metric,
          record.std
            ? `${record.score} ± ${record.std} (${record.rank})`
            : `${record.score} (${record.rank})`,
        ]),
      ),
      rank: `${sum.toLocaleString()} (${(index + 1).toLocaleString()})`,
    });
  });

  // Step 6: Draw table
  return (
    <DataTable rows={rows} headers={headers} isSortable>
      {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
        <TableContainer>
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((header, index) => (
                  <TableHeader
                    key={'header--' + index}
                    {...getHeaderProps({ header })}
                  >
                    {header.key === 'rank' ? (
                      <span>&Sigma;&nbsp;{header.header}</span>
                    ) : (
                      header.header
                    )}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={'row--' + index} {...getRowProps({ row })}>
                  {row.cells.map((cell) => (
                    <TableCell key={cell.id}>
                      <div className={classes.tableCell}>
                        {cell.value ? (
                          cell.value.includes('(1)') ? (
                            <strong>{cell.value}</strong>
                          ) : (
                            cell.value
                          )
                        ) : (
                          '-'
                        )}
                        {plot && metrics.includes(cell.info.header)
                          ? sparkline(distributions.get(cell.id), theme)
                          : null}
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </DataTable>
  );
}

function disclaimers({
  std = false,
  spakline = false,
  theme,
}: {
  std?: boolean;
  spakline?: boolean;
  theme?: string;
}) {
  return (
    <div className={classes.disclaimers}>
      <span>
        <sup>*</sup>&nbsp;
        <strong>(rank)</strong> indicates model's comparative position w.r.t to
        other models for a given metric
      </span>
      {std && (
        <span>
          <sup>*</sup>&nbsp;
          <strong>value±std</strong> shows averages of aggregate values and
          standard deviation across all tasks
        </span>
      )}
      {spakline && (
        <div className={classes.disclaimerSparkline}>
          <span>
            <sup>*</sup>&nbsp;
          </span>
          {sparkline({ low: 5, medium: 10, high: 15 }, theme)}
          <span>reflects confidence level on the aggregate values.&nbsp;</span>
          <div className={classes.legendLow}>&#9632;</div>
          <span>
            &nbsp;# of tasks where where minority rating is far from majority
            rating,&nbsp;
          </span>
          <div className={classes.legendMedium}>&#9632;</div>
          <span>
            &nbsp;# of tasks where where minority rating is similar to majority
            rating and&nbsp;
          </span>
          <div className={classes.legendHigh}>&#9632;</div>
          <span>
            &nbsp;# of tasks where where all annotators chose same rating
          </span>
        </div>
      )}
    </div>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function PerformanceOverview({
  evaluationsPerMetric,
  models,
  metrics,
  filters,
  numTasks,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [WindowWidth, setWindowWidth] = useState<number>(
    global?.window && window.innerWidth,
  );
  const [WindowHeight, setWindowHeight] = useState<number>(
    global?.window && window.innerHeight,
  );
  const aggregators: Aggregator[] = [averageAggregator, majorityAggregator];
  const [selectedAggregators, setSelectedAggregators] = useState<{
    [key: string]: Aggregator;
  }>(
    Object.fromEntries(
      metrics
        .filter((metric) => metric.author === 'human')
        .map((metric) => [
          metric.name,
          metric.aggregator === 'majority'
            ? majorityAggregator
            : averageAggregator,
        ]),
    ),
  );
  const [selectedFilters, setSelectedFilters] = useState<{
    [key: string]: string[];
  }>({});
  const [modelColors, modelOrder] = getModelColorPalette(models);
  const [hiddenMetrics, setHiddenMetrics] = useState<Metric[]>([]);

  // Step 2: Run effects
  // Step 2.a: Adjust graph width & heigh based on window size
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

  // Step 2.c: Generate performance data for human and algorithmic metrics
  const [humanMetricsData, algorithmicMetricsData, numSelectedTasks] =
    useMemo(() => {
      // Eligible metrics
      const eligibleMetrics = Object.fromEntries(
        metrics.map((metric) => [metric.name, metric]),
      );

      let hData: {
        model: string;
        metric: string;
        score: number;
        std: number;
        rank: number;
        size: number;
        levels: { low: number; medium: number; high: number };
        order?: 'ascending' | 'descending';
      }[] = [];
      let aData: {
        model: string;
        metric: string;
        score: number;
        std?: number;
        rank: number;
        size: number;
        levels: { low: number; medium: number; high: number };
        order?: 'ascending' | 'descending';
      }[] = [];

      const performancePerModel: {
        [key: string]: {
          [key: string]: {
            value: number;
            std: number;
            levels: { low: number; medium: number; high: number };
          };
        };
      } = {};
      const eligibleEvaluationsPerModel: {
        [key: string]: { [key: string]: number };
      } = {};

      // Step 1: Calculate model performance across entire dataset
      let selectedTasksCount;
      for (const [metric, evaluations] of Object.entries(
        evaluationsPerMetric,
      )) {
        const aggregator = selectedAggregators[metric] || averageAggregator;

        // Select evaluations based on selected filters
        const selectedEvaluations = !isEmpty(selectedFilters)
          ? evaluations.filter((e) => {
              return areObjectsIntersecting(selectedFilters, e);
            })
          : evaluations;

        // Calculate selected tasks count
        selectedTasksCount = selectedEvaluations.length / models.length;

        selectedEvaluations.forEach((evaluation) => {
          // Step 1.a: Calcuate aggregated value
          const aggregateStatistics: AggregationStatistics = aggregator.apply(
            Object.values(evaluation.annotations[`${metric}`]).map(
              (entry) => entry.value,
            ),
            eligibleMetrics[metric].values,
          );

          // Step 1.b: Skip evaluations, if no majority aggrement exist
          if (
            aggregator.name === 'majority' &&
            aggregateStatistics.value === 'Indeterminate'
          ) {
            return;
          }

          // Step 1.c: Cast to numeric value for further processing
          const aggregateValue = castToNumber(
            aggregateStatistics.value,
            eligibleMetrics[metric].values,
          );

          // Step 1.d: Translate model id to model name
          const modelName =
            models.find((model) => model.modelId === evaluation.modelId)
              ?.name || evaluation.modelId;

          // Step 1.d: Update performance per model object
          if (performancePerModel.hasOwnProperty(modelName)) {
            if (performancePerModel[modelName].hasOwnProperty(metric)) {
              performancePerModel[modelName][metric].value += aggregateValue;
              performancePerModel[modelName][metric].std +=
                aggregateStatistics.std;

              if (
                aggregateStatistics.confidence ===
                AggregationConfidenceLevels.LOW
              ) {
                performancePerModel[modelName][metric].levels.low += 1;
              }
              if (
                aggregateStatistics.confidence ===
                AggregationConfidenceLevels.MEDIUM
              ) {
                performancePerModel[modelName][metric].levels.medium += 1;
              }
              if (
                aggregateStatistics.confidence ===
                AggregationConfidenceLevels.HIGH
              ) {
                performancePerModel[modelName][metric].levels.high += 1;
              }
            } else {
              performancePerModel[modelName][metric] = {
                value: aggregateValue,
                std: aggregateStatistics.std,
                levels: {
                  low:
                    aggregateStatistics.confidence ===
                    AggregationConfidenceLevels.LOW
                      ? 1
                      : 0,
                  medium:
                    aggregateStatistics.confidence ===
                    AggregationConfidenceLevels.MEDIUM
                      ? 1
                      : 0,
                  high:
                    aggregateStatistics.confidence ===
                    AggregationConfidenceLevels.HIGH
                      ? 1
                      : 0,
                },
              };
            }
          } else {
            performancePerModel[modelName] = {
              [metric]: {
                value: aggregateValue,
                std: aggregateStatistics.std,
                levels: {
                  low:
                    aggregateStatistics.confidence ===
                    AggregationConfidenceLevels.LOW
                      ? 1
                      : 0,
                  medium:
                    aggregateStatistics.confidence ===
                    AggregationConfidenceLevels.MEDIUM
                      ? 1
                      : 0,
                  high:
                    aggregateStatistics.confidence ===
                    AggregationConfidenceLevels.HIGH
                      ? 1
                      : 0,
                },
              },
            };
          }

          // Step 1.e: Update eligible evaluations per model object
          if (eligibleEvaluationsPerModel.hasOwnProperty(modelName)) {
            if (eligibleEvaluationsPerModel[modelName].hasOwnProperty(metric)) {
              eligibleEvaluationsPerModel[modelName][metric] += 1;
            } else {
              eligibleEvaluationsPerModel[modelName][metric] = 1;
            }
          } else {
            eligibleEvaluationsPerModel[modelName] = {
              [metric]: 1,
            };
          }
        });
      }

      // Step 2: Add raw performance data
      for (const [model, performance] of Object.entries(performancePerModel)) {
        for (const [metric, statistics] of Object.entries(performance)) {
          if (eligibleMetrics.hasOwnProperty(metric)) {
            if (eligibleMetrics[metric].author === 'human') {
              hData.push({
                model: model,
                metric: extractMetricDisplayName(eligibleMetrics[metric]),
                score: parseFloat(
                  (statistics.value / selectedTasksCount).toFixed(2),
                ),
                rank: -1,
                size: eligibleEvaluationsPerModel[model][metric],
                std: parseFloat(
                  (statistics.std / selectedTasksCount).toFixed(2),
                ),
                levels: statistics.levels,
                ...(eligibleMetrics[metric].order && {
                  order: eligibleMetrics[metric].order,
                }),
              });
            } else if (eligibleMetrics[metric].author === 'algorithm') {
              aData.push({
                model: model,
                metric: extractMetricDisplayName(eligibleMetrics[metric]),
                score: parseFloat(
                  (statistics.value / selectedTasksCount).toFixed(2),
                ),
                rank: -1,
                size: eligibleEvaluationsPerModel[model][metric],
                std: parseFloat(
                  (statistics.std / selectedTasksCount).toFixed(2),
                ),
                levels: statistics.levels,
                ...(eligibleMetrics[metric].order && {
                  order: eligibleMetrics[metric].order,
                }),
              });
            }
          }
        }
      }

      // Step 3: Filter hidden metrics data
      const hiddenMetricNames = hiddenMetrics.map((metric) =>
        extractMetricDisplayName(metric),
      );
      // Step 3.a: Human metrics
      if (Array.isArray(hData)) {
        hData = hData.filter(
          (entry) => !hiddenMetricNames.includes(entry.metric),
        );
      }
      // Step 3.b: Algorithmic metrics
      if (Array.isArray(aData)) {
        aData = aData.filter(
          (entry) => !hiddenMetricNames.includes(entry.metric),
        );
      }

      // Step 4: Generate add rank information
      // Step 4.a: Human metrics
      if (Array.isArray(hData)) {
        calculateRanks(hData);
      }

      // Step 4.b: Algorithmic metrics
      if (Array.isArray(aData)) {
        calculateRanks(aData);
      }

      return [hData, aData, selectedTasksCount];
    }, [
      evaluationsPerMetric,
      metrics,
      models,
      selectedAggregators,
      selectedFilters,
      hiddenMetrics,
    ]);

  const humanMetricsInData = new Set(
    humanMetricsData.map((entry) => entry.metric),
  );
  const algorithmicmetricsInData = new Set(
    algorithmicMetricsData.map((entry) => entry.metric),
  );

  // Step 3: Render
  return (
    <div className={classes.page}>
      <div className={classes.selectors}>
        {Object.entries(selectedAggregators).map(([metricName, aggregator]) => {
          const metric = metrics.find((entry) => entry.name === metricName);
          return (
            <div
              key={`${metricName}-aggregator`}
              className={classes.aggregatorSelector}
            >
              <h5>
                {metric
                  ? extractMetricDisplayName(metric)
                  : metricName.charAt(0).toUpperCase() +
                    metricName.slice(1).toLowerCase()}
              </h5>
              <AggregatorSelector
                aggregators={aggregators}
                defaultValue={aggregator}
                onSelect={(selection: Aggregator) => {
                  setSelectedAggregators({
                    ...selectedAggregators,
                    [metricName]: selection,
                  });
                }}
                warn={aggregator.name === 'majority'}
                warnText={
                  aggregator.name === 'majority'
                    ? 'Caution: Denominator might vary for categorical metrics.'
                    : 'You must select an aggregator to view results.'
                }
              ></AggregatorSelector>
            </div>
          );
        })}
      </div>

      {!isEmpty(filters) ? (
        <Filters
          keyPrefix="PerformanceOverview"
          filters={filters}
          selectedFilters={selectedFilters}
          setSelectedFilters={setSelectedFilters}
        />
      ) : null}

      <FilterMetrics
        metrics={metrics}
        hiddenMetrics={hiddenMetrics}
        setHiddenMetrics={setHiddenMetrics}
      />

      <div
        className={cx(
          classes.row,
          humanMetricsInData.size == 0 || algorithmicmetricsInData.size == 0
            ? classes.center
            : null,
        )}
      >
        {humanMetricsInData.size ? (
          <div className={classes.column}>
            <h4>
              Human Evaluations ({numSelectedTasks}/{numTasks})
            </h4>

            <div className={classes.performanceTable}>
              {drawTable(
                humanMetricsData,
                Array.from(humanMetricsInData),
                true,
                theme,
              )}
              {disclaimers({ std: true, spakline: true, theme: theme })}
            </div>

            <div className={classes.row}>
              {humanMetricsInData.size < 3 ? (
                <>
                  <GroupedBarChart
                    data={humanMetricsData
                      .sort((a, b) => (a.model > b.model ? -1 : 1))
                      .map((entry) => {
                        return {
                          group: entry.model,
                          key: entry.metric,
                          value: entry.score,
                        };
                      })}
                    options={{
                      axes: {
                        left: {
                          mapsTo: 'value',
                        },
                        bottom: {
                          mapsTo: 'key',
                          scaleType: ScaleTypes.LABELS,
                        },
                      },
                      width: `${Math.round(WindowWidth * 0.45)}px`,
                      height: `${Math.round(WindowHeight * 0.5)}px`,
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
                </>
              ) : (
                <>
                  <RadarChart
                    data={humanMetricsData.map((entry) => {
                      const metric = metrics.find(
                        (m) => m.displayName === entry.metric,
                      );
                      return {
                        model: entry.model,
                        metric: entry.metric,
                        score:
                          metric && metric.maxValue
                            ? Math.round(
                                (entry.score /
                                  (typeof metric.maxValue === 'number'
                                    ? metric.maxValue
                                    : castToNumber(
                                        metric.maxValue?.value,
                                        metric.values,
                                      ))) *
                                  100,
                              ) / 100
                            : entry.score,
                      };
                    })}
                    options={{
                      radar: {
                        alignment: Alignments.CENTER,
                        axes: {
                          angle: 'metric',
                          value: 'score',
                        },
                      },
                      data: {
                        groupMapsTo: 'model',
                      },
                      color: {
                        scale: modelColors,
                      },
                      legend: {
                        alignment: Alignments.CENTER,
                        order: modelOrder,
                      },
                      width: `${Math.round(WindowWidth * 0.45)}px`,
                      height: `${Math.round(WindowHeight * 0.5)}px`,
                      toolbar: {
                        enabled: false,
                      },
                      theme: theme,
                    }}
                  ></RadarChart>
                </>
              )}
            </div>
          </div>
        ) : null}
        {humanMetricsInData.size && algorithmicmetricsInData.size ? (
          <div className={classes.seperator}></div>
        ) : null}
        {algorithmicmetricsInData.size ? (
          <div className={classes.column}>
            <h4>
              Algorithmic Evaluations ({numSelectedTasks}/{numTasks})
            </h4>
            <div className={classes.performanceTable}>
              {drawTable(
                algorithmicMetricsData,
                Array.from(algorithmicmetricsInData),
              )}
              {disclaimers({})}
            </div>
            <div className={classes.row}>
              {algorithmicmetricsInData.size < 3 ? (
                <>
                  <GroupedBarChart
                    data={algorithmicMetricsData
                      .sort((a, b) => (a.model > b.model ? -1 : 1))
                      .map((entry) => {
                        return {
                          group: entry.model,
                          key: entry.metric,
                          value: entry.score,
                        };
                      })}
                    options={{
                      axes: {
                        left: {
                          mapsTo: 'value',
                        },
                        bottom: {
                          mapsTo: 'key',
                          scaleType: ScaleTypes.LABELS,
                        },
                      },
                      width: `${Math.round(WindowWidth * 0.45)}px`,
                      height: `${Math.round(WindowHeight * 0.5)}px`,
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
                </>
              ) : (
                <>
                  <RadarChart
                    data={algorithmicMetricsData.map((entry) => {
                      const metric = metrics.find(
                        (m) => m.displayName === entry.metric,
                      );
                      return {
                        model: entry.model,
                        metric: entry.metric,
                        score:
                          metric && metric.maxValue
                            ? Math.round(
                                (entry.score /
                                  (typeof metric.maxValue === 'number'
                                    ? metric.maxValue
                                    : castToNumber(
                                        metric.maxValue?.value,
                                        metric.values,
                                      ))) *
                                  100,
                              ) / 100
                            : entry.score,
                      };
                    })}
                    options={{
                      radar: {
                        alignment: Alignments.CENTER,
                        axes: {
                          angle: 'metric',
                          value: 'score',
                        },
                      },
                      data: {
                        groupMapsTo: 'model',
                      },
                      color: {
                        scale: modelColors,
                      },
                      legend: {
                        alignment: Alignments.CENTER,
                        order: modelOrder,
                      },
                      width: `${Math.round(WindowWidth * 0.45)}px`,
                      height: `${Math.round(WindowHeight * 0.5)}px`,
                      toolbar: {
                        enabled: false,
                      },
                      theme: theme,
                    }}
                  ></RadarChart>
                </>
              )}
            </div>
          </div>
        ) : null}
        {humanMetricsInData.size === 0 &&
        algorithmicmetricsInData.size === 0 ? (
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
      </div>
    </div>
  );
}
