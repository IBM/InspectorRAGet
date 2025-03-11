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

import { isEmpty } from 'lodash';
import cx from 'classnames';
import { useState, useMemo } from 'react';
import {
  Tag,
  FilterableMultiSelect,
  Toggletip,
  ToggletipButton,
  ToggletipContent,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
} from '@carbon/react';
import { Information, WarningAlt } from '@carbon/icons-react';

import { BoxplotChart, StackedBarChart } from '@carbon/charts-react';
import { ScaleTypes } from '@carbon/charts';

import { useTheme } from '@/src/theme';
import { Model, TaskEvaluation, Metric } from '@/src/types';
import { AgreementLevels } from '@/src/utilities/metrics';
import {
  getAgreementLevelColorPalette,
  getVotingPatternColorPalette,
} from '@/src/utilities/colors';
import { areObjectsIntersecting } from '@/src/utilities/objects';
import Filters from '@/src/components/filters/Filters';

import '@carbon/charts-react/styles.css';
import classes from './AnnotatorBehavior.module.scss';
import InterAnnotatorAgreementHeatMap from '@/src/views/annotator-behavior/InterAnnotatorAgreementHeatMap.tsx';

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
//                                CONSTANTS
// ===================================================================================
const VOTING_PATTERNS: string[] = Object.keys(getVotingPatternColorPalette());

// ===================================================================================
//                               HELPER FUNCTIONS
// ===================================================================================
function normalize(data: { [key: string]: number }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    Object.entries(data).map(([agreementLevel, count]) => {
      return [
        agreementLevel,
        Math.round(((count / total) * 100 + Number.EPSILON) * 100) / 100,
      ];
    }),
  );
}

function updateVotingPattern(
  votingPatternsPerTopicPerVoter: {
    [key: string]: { [key: string]: { [key: string]: number } };
  },
  topic: string,
  voter: string,
  votingPattern: string,
) {
  if (votingPatternsPerTopicPerVoter.hasOwnProperty(topic)) {
    if (votingPatternsPerTopicPerVoter[topic].hasOwnProperty(voter)) {
      votingPatternsPerTopicPerVoter[topic][voter][votingPattern] += 1;
    } else {
      votingPatternsPerTopicPerVoter[topic][voter] = {
        ...Object.fromEntries(VOTING_PATTERNS.map((pattern) => [pattern, 0])),
        [votingPattern]: 1,
      };
    }
  } else {
    votingPatternsPerTopicPerVoter[topic] = {
      [voter]: {
        ...Object.fromEntries(VOTING_PATTERNS.map((pattern) => [pattern, 0])),
        [votingPattern]: 1,
      },
    };
  }
}

function prepareBoxPlotData(data: { [key: string]: number[] }) {
  // Populate plot data array
  const plotData: { [key: string]: string | number }[] = [];
  for (const [worker, durations] of Object.entries(data)) {
    durations.forEach((duration) => {
      plotData.push({
        group: worker,
        key: 'All',
        value: Math.floor(duration / 60) + (duration % 60) / 60,
      });
    });
  }
  return plotData;
}
// ===================================================================================
//                              RENDER FUNCTIONS
// ===================================================================================
function renderAgreementDistribution(
  record: {
    [key: string]: { [key: string]: number };
  },
  key: string,
  caption: string,
  models: Model[],
  theme?: string,
) {
  // Step 1: Compute overall agreement level distribution
  const overall: { [key: string]: number } = {
    No: 0,
    Low: 0,
    High: 0,
    Absolute: 0,
  };
  for (const distribution of Object.values(record)) {
    for (const [agreementLevel, count] of Object.entries(distribution)) {
      overall[agreementLevel] += count;
    }
  }

  // Step 2: Build chart data
  const chartData: { [key: string]: string | number }[] = [];
  for (const [agreementLevel, count] of Object.entries(normalize(overall))) {
    chartData.push({ group: agreementLevel, key: 'All', value: count });
  }
  for (const [modelId, distribution] of Object.entries(record)) {
    for (const [agreementLevel, count] of Object.entries(
      normalize(distribution),
    )) {
      const model = models.find((entry) => entry.modelId === modelId);
      chartData.push({
        group: agreementLevel,
        key: model ? model.name : modelId,
        value: count,
      });
    }
  }

  // Step 3: Render
  return (
    <div key={key} className={classes.graph}>
      <h5>
        <strong>{caption}</strong>
      </h5>
      <StackedBarChart
        data={chartData}
        options={{
          axes: {
            left: {
              scaleType: ScaleTypes.LABELS,
            },
            bottom: {
              stacked: true,
              ticks: {
                formatter: (tick) => tick + '%',
              },
            },
          },
          color: {
            scale: getAgreementLevelColorPalette(),
          },
          width: '500px',
          height: '500px',
          toolbar: {
            enabled: false,
          },
          theme: theme,
        }}
      ></StackedBarChart>
    </div>
  );
}

function renderAnnotatorVotingPattern(
  record: {
    [key: string]: { [key: string]: number };
  },
  key: string,
  caption: string,
  theme?: string,
) {
  // Step 1: Compute overall agreement level distribution
  const overall: { [key: string]: number } = Object.fromEntries(
    VOTING_PATTERNS.map((pattern) => [pattern, 0]),
  );
  for (const distribution of Object.values(record)) {
    for (const [affiliaion, count] of Object.entries(distribution)) {
      overall[affiliaion] += count;
    }
  }

  // Step 2: Build chart data
  const chartData: { [key: string]: string | number }[] = [];
  for (const [affliation, count] of Object.entries(normalize(overall))) {
    chartData.push({ group: affliation, key: 'All', value: count });
  }
  for (const [individual, distribution] of Object.entries(record)) {
    for (const [affiliaion, count] of Object.entries(normalize(distribution))) {
      chartData.push({
        group: affiliaion,
        key: `ID: ${individual}`,
        value: count,
      });
    }
  }

  // Step 3: Render
  return (
    <div key={key} className={classes.graph}>
      <h5>
        <strong>{caption}</strong>
      </h5>

      <StackedBarChart
        data={chartData}
        options={{
          axes: {
            left: {
              scaleType: ScaleTypes.LABELS,
            },
            bottom: {
              stacked: true,
              ticks: {
                formatter: (tick) => tick + '%',
              },
            },
          },
          color: {
            scale: getVotingPatternColorPalette(),
          },
          width: '500px',
          height: '500px',
          toolbar: {
            enabled: false,
          },
          theme: theme,
        }}
      ></StackedBarChart>
    </div>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function AnnotatorBehavior({
  evaluationsPerMetric,
  models,
  metrics,
  filters,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const eligibleMetricNames = useMemo(() => {
    return new Set(metrics.map((metric) => metric.name));
  }, [metrics]);
  const [selectedModels, setSelectedModels] = useState<Model[]>(models);
  const [selectedFilters, setSelectedFilters] = useState<{
    [key: string]: string[];
  }>({});

  // Step 2: Run effects
  // Step 2.a: Fetch theme
  const { theme } = useTheme();

  // Step 2.b: Adjust visible evaluations based on selected models
  const visibleEvaluationsPerMetric = useMemo(() => {
    const filteredEvaluationsPerMetric: { [key: string]: TaskEvaluation[] } =
      {};
    for (const [metric, evaluations] of Object.entries(evaluationsPerMetric)) {
      if (eligibleMetricNames.has(metric)) {
        filteredEvaluationsPerMetric[metric] = evaluations.filter(
          (evaluation) =>
            selectedModels
              .map((model) => model.modelId)
              .includes(evaluation.modelId) &&
            (!isEmpty(selectedFilters)
              ? areObjectsIntersecting(selectedFilters, evaluation)
              : true),
        );
      }
    }
    return filteredEvaluationsPerMetric;
  }, [
    evaluationsPerMetric,
    eligibleMetricNames,
    selectedModels,
    selectedFilters,
  ]);

  // Step 2.c: Build agreement distribution chart data per model for visible evaluations
  const [
    agreementDistributionPerMetricPerModel,
    annotatorVotingPatternPerMetric,
  ] = useMemo(() => {
    // Step 2.c.i: Initialize necessary variables
    const agreementStatisticPerMetricPerModel: {
      [key: string]: { [key: string]: { [key: string]: number } };
    } = {};
    const votingPatternsPerMetricPerAnnotator: {
      [key: string]: { [key: string]: { [key: string]: number } };
    } = {};

    for (const metric in visibleEvaluationsPerMetric) {
      agreementStatisticPerMetricPerModel[metric] = Object.fromEntries(
        selectedModels.map((model) => [
          model.modelId,
          { No: 0, Low: 0, High: 0, Absolute: 0 },
        ]),
      );
    }

    // Step 2.c.ii: Iterate over evaluations for each metric
    for (const [metric, evaluations] of Object.entries(
      visibleEvaluationsPerMetric,
    )) {
      evaluations.forEach((evaluation) => {
        switch (evaluation[`${metric}_agg`].level) {
          // Case: All annotators gave same rating
          case AgreementLevels.ABSOLUTE_AGREEMENT:
            agreementStatisticPerMetricPerModel[metric][evaluation.modelId][
              'Absolute'
            ] += 1;

            // Update voting pattern
            for (const annotator in evaluation[metric]) {
              updateVotingPattern(
                votingPatternsPerMetricPerAnnotator,
                metric,
                annotator,
                'Unanimous',
              );
            }
            break;

          case AgreementLevels.HIGH_AGREEMENT:
            // Case: Majority of annotators gave same rating and minority rating is close to majority rating
            agreementStatisticPerMetricPerModel[metric][evaluation.modelId][
              'High'
            ] += 1;

            // Update voting pattern
            for (const annotator in evaluation[metric]) {
              updateVotingPattern(
                votingPatternsPerMetricPerAnnotator,
                metric,
                annotator,
                evaluation[metric][annotator]['value'] ===
                  evaluation[`${metric}_agg`].value
                  ? 'Majority'
                  : 'Dissidents (minor)',
              );
            }

            break;

          case AgreementLevels.LOW_AGREEMENT:
            // Case: Majority of annotators gave same rating and minority rating is far from majority rating
            agreementStatisticPerMetricPerModel[metric][evaluation.modelId][
              'Low'
            ] += 1;

            // Update voting pattern
            for (const annotator in evaluation[metric]) {
              updateVotingPattern(
                votingPatternsPerMetricPerAnnotator,
                metric,
                annotator,
                evaluation[metric][annotator]['value'] ===
                  evaluation[`${metric}_agg`].value
                  ? 'Majority'
                  : 'Dissidents (major)',
              );
            }

            break;

          default:
            // Case: All annotators gave different rating
            agreementStatisticPerMetricPerModel[metric][evaluation.modelId][
              'No'
            ] += 1;

            // Update voting pattern
            for (const annotator in evaluation[metric]) {
              updateVotingPattern(
                votingPatternsPerMetricPerAnnotator,
                metric,
                annotator,
                'Divided',
              );
            }
        }
      });
    }

    return [
      agreementStatisticPerMetricPerModel,
      votingPatternsPerMetricPerAnnotator,
    ];
  }, [visibleEvaluationsPerMetric, selectedModels]);

  // Step 2.d: Build time duration distribution per annotator for all evaluations
  const timeDistributionPerAnnotator: {
    [key: string]: number[];
  } = useMemo(() => {
    const temp: { [key: string]: number[] } = {};
    const processedEvaluationTaskIDs = new Set();
    for (const [metric, evaluations] of Object.entries(evaluationsPerMetric)) {
      evaluations.forEach((evaluation) => {
        if (!processedEvaluationTaskIDs.has(evaluation.taskId)) {
          Object.keys(evaluation[metric]).forEach((worker) => {
            if (evaluation[metric][worker]['duration'] !== undefined) {
              if (temp.hasOwnProperty(worker)) {
                temp[worker] = [
                  ...temp[worker],
                  evaluation[metric][worker]['duration'],
                ];
              } else {
                temp[worker] = [evaluation[metric][worker]['duration']];
              }
            }
          });
        }
      });
      break;
    }
    return temp;
  }, [evaluationsPerMetric]);

  // Step 3: Render
  return (
    <div className={classes.page}>
      {Array.isArray(metrics) && !metrics.length ? (
        <>
          <div className={classes.warningContainer}>
            <WarningAlt
              height={'32px'}
              width={'32px'}
              className={classes.warningContainerIcon}
            />
            <span className={classes.warningContainerText}>
              Nothing to see here in absence of human evaluations.
            </span>
          </div>
        </>
      ) : (
        <>
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
          </div>
          {!isEmpty(filters) ? (
            <Filters
              keyPrefix="AnnotatorBehavior"
              filters={filters}
              selectedFilters={selectedFilters}
              setSelectedFilters={setSelectedFilters}
            />
          ) : null}
          <div className={classes.row}>
            <h4>Agreement Distribution</h4>
            <div
              className={cx(
                classes.graphsContainer,
                Object.keys(agreementDistributionPerMetricPerModel).length <= 3
                  ? classes.center
                  : null,
              )}
            >
              {Object.entries(agreementDistributionPerMetricPerModel).map(
                ([metricName, agreementDistributionPerModel], idx) => {
                  const metric = metrics.find(
                    (entry) => entry.name === metricName,
                  );
                  return renderAgreementDistribution(
                    agreementDistributionPerModel,
                    'agreement-distribution-graph-' + idx,
                    metric?.displayName
                      ? metric?.displayName
                      : metricName.charAt(0).toUpperCase() +
                          metricName.slice(1).toLowerCase(),
                    models,
                    theme,
                  );
                },
              )}
            </div>
          </div>
          <div className={classes.row}>
            <h4>Annotator Contribution</h4>
            <div
              className={cx(
                classes.graphsContainer,
                Object.keys(annotatorVotingPatternPerMetric).length <= 3
                  ? classes.center
                  : null,
              )}
            >
              {Object.entries(annotatorVotingPatternPerMetric).map(
                ([metricName, distribution], idx) => {
                  const metric = metrics.find(
                    (entry) => entry.name === metricName,
                  );
                  return renderAnnotatorVotingPattern(
                    distribution,
                    'annotator-abnormality-graph-' + idx,
                    metric?.displayName
                      ? metric?.displayName
                      : metricName.charAt(0).toUpperCase() +
                          metricName.slice(1).toLowerCase(),
                    theme,
                  );
                },
              )}
            </div>
          </div>
          <div className={classes.row}>
            <h4>
              Inter Annotator Agreement (Cohen's Kappa&nbsp;
              <Toggletip>
                <ToggletipButton label="Show information">
                  <Information />
                </ToggletipButton>
                <ToggletipContent>
                  <h6>How to interprete Cohen's kappa coefficient?</h6>
                  <DataTable
                    rows={[
                      {
                        id: 0,
                        score: '0',
                        intepretation: 'No agreement',
                      },
                      {
                        id: 1,
                        score: '0.10-0.20',
                        intepretation: 'Slight agreement',
                      },
                      {
                        id: 2,
                        score: '0.21-0.40',
                        intepretation: 'Fair agreement',
                      },
                      {
                        id: 3,
                        score: '0.41-0.60',
                        intepretation: 'Moderate agreement',
                      },
                      {
                        id: 4,
                        score: '0.61-0.80',
                        intepretation: 'Substantial agreement',
                      },
                      {
                        id: 5,
                        score: '0.81-0.99',
                        intepretation: 'Near perfect agreement',
                      },
                      {
                        id: 6,
                        score: '1',
                        intepretation: 'Perfect agreement',
                      },
                    ]}
                    headers={[
                      {
                        key: 'score',
                        header: "Cohen's kappa",
                      },
                      {
                        key: 'intepretation',
                        header: 'Intepretation',
                      },
                    ]}
                  >
                    {({
                      rows,
                      headers,
                      getTableProps,
                      getHeaderProps,
                      getRowProps,
                    }) => (
                      <Table {...getTableProps()}>
                        <TableHead>
                          <TableRow>
                            {headers.map((header, idx) => (
                              <TableHeader
                                key={'toggletip-table-header-' + idx}
                                {...getHeaderProps({ header })}
                              >
                                {header.header}
                              </TableHeader>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.map((row, idx) => (
                            <TableRow
                              key={'toggletip-table-row-' + idx}
                              {...getRowProps({ row })}
                            >
                              {row.cells.map((cell) => (
                                <TableCell key={cell.id}>
                                  {cell.value}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </DataTable>
                </ToggletipContent>
              </Toggletip>
              )
            </h4>
            <div
              className={cx(
                classes.graphsContainer,
                Object.keys(visibleEvaluationsPerMetric).length <= 3
                  ? classes.center
                  : null,
              )}
            >
              {Object.keys(visibleEvaluationsPerMetric).map(
                (metricName, idx) => {
                  const metric = metrics.find(
                    (entry) => entry.name === metricName,
                  );
                  return (
                    <div
                      key={'inter-annotator-agreement-heatmap-' + idx}
                      className={classes.graph}
                    >
                      <h5>
                        <strong>
                          {metric?.displayName
                            ? metric?.displayName
                            : metricName.charAt(0).toUpperCase() +
                              metricName.slice(1).toLowerCase()}
                        </strong>
                      </h5>
                      {visibleEvaluationsPerMetric[metricName] && (
                        <InterAnnotatorAgreementHeatMap
                          evaluations={visibleEvaluationsPerMetric[metricName]}
                          metric={metricName}
                          theme={theme}
                        ></InterAnnotatorAgreementHeatMap>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          </div>
          {!isEmpty(timeDistributionPerAnnotator) ? (
            <div className={classes.row}>
              <h4>Time spent</h4>
              <div className={classes.timeSpentGraphsContainer}>
                <div
                  key={'time-spent-graph'}
                  className={classes.timeSpentDistributionGraph}
                >
                  <h5>
                    <strong>Time spent per task (in minutes)</strong>
                  </h5>
                  <BoxplotChart
                    key={'per-annotator-time-spent'}
                    data={prepareBoxPlotData(timeDistributionPerAnnotator)}
                    options={{
                      axes: {
                        left: {
                          scaleType: ScaleTypes.LABELS,
                          mapsTo: 'group',
                        },
                        bottom: {
                          mapsTo: 'value',
                        },
                      },
                      width: '1000px',
                      height: '400px',
                      toolbar: {
                        enabled: false,
                      },
                      theme: theme,
                    }}
                  ></BoxplotChart>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
