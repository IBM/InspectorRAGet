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

import { isEmpty, find } from 'lodash';
import cx from 'classnames';
import { useState, useMemo, useEffect } from 'react';
import {
  SkeletonText,
  Select,
  SelectItem,
  Button,
  ButtonSkeleton,
  Tooltip,
} from '@carbon/react';
import { ChevronDown, ChevronUp } from '@carbon/icons-react';
import {
  HistogramChart,
  GroupedBarChart,
  DonutChart,
  LineChart,
  StackedBarChart,
} from '@carbon/charts-react';
import { ScaleTypes } from '@carbon/charts';

import { useTheme } from '@/src/theme';
import { Task, Aggregator } from '@/src/types';
import {
  unionAggregator,
  intersectionAggregator,
  majorityUnionAggregator,
} from '@/src/utilities/aggregators';

import '@carbon/charts-react/styles.css';
import classes from './DataCharacteristics.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================

interface Props {
  tasks: Task[];
  filters: { [key: string]: string[] };
}

// ===================================================================================
//                               HELPER FUNCTIONS
// ===================================================================================
function normalize(data: { [key: string]: number }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    Object.entries(data).map(([key, count]) => {
      return [key, Math.round((count / total) * 100 * 100) / 100];
    }),
  );
}

// ===================================================================================
//                               COMPUTE FUNCTIONS
// ===================================================================================
function computeWordCount(tasks: Task[], filters: string[]) {
  // Step 1: Initialize necessary variable
  const wordCountInInputPerTask: { [key: string]: string | number }[] = [];

  // Step 2: Iterate over each task
  tasks.forEach((task) => {
    // Step 2.a: Identify text
    let text = '';
    if (typeof task.input === 'string') {
      text = task.input;
    } else if (Array.isArray(task.input)) {
      task.input.forEach((turn) => {
        if (turn.hasOwnProperty('text') && turn.text) {
          text += turn.text.trim();
        } else if (turn.hasOwnProperty('content') && turn.content) {
          text += turn.content.trim();
        }
      });
    }

    // Step 2.b: Build record
    const record = {
      count: text.trim().split(/\s+/).length,
    };
    filters.forEach((filter) => {
      if (task.hasOwnProperty(filter) && task[filter]) {
        record[filter] = task[filter];
      }
    });

    // Step 2.c: Add record
    wordCountInInputPerTask.push(record);
  });

  // Step 3: Return
  return wordCountInInputPerTask;
}

function computeUtterances(tasks: Task[], filters: string[]) {
  // Step 1: Initialize necessary variable
  const utterancesInInputPerTask: { [key: string]: string | number }[] = [];

  // Step 2: Iterate over each task
  tasks.forEach((task) => {
    // Step 2.a: Identify input is array
    if (Array.isArray(task.input)) {
      // Step 2.b: Build record
      const record = {
        count: task.input.length,
      };

      filters.forEach((filter) => {
        if (task.hasOwnProperty(filter) && task[filter]) {
          record[filter] = task[filter];
        }
      });

      // Step 2.c: Add record
      utterancesInInputPerTask.push(record);
    }
  });

  // Step 3: Return
  return utterancesInInputPerTask;
}

function computeContextRelevance(
  tasks: Task[],
  filters: string[],
  aggregator: Aggregator,
) {
  // Step 0: Helper functions
  function add(
    records: {
      key: string;
      value: number;
      [key: string]: string | number;
    }[],
    recordToAdd: {
      key: string;
      [key: string]: string | number;
    },
  ) {
    // Step 1: Find existing records
    const existingRecord = find(records, recordToAdd);

    // Step 2: Add record
    if (existingRecord) {
      existingRecord.value += 1;
    } else {
      records.push({ ...recordToAdd, value: 1 });
    }
  }

  // Step 1: Initialize necessary variable
  const relevantContextIndexes: {
    key: string;
    value: number;
    [key: string]: string | number;
  }[] = [];

  // Step 2: Iterate over each task
  tasks.forEach((task) => {
    // Step 2.a: Fetch context relevance annotations, if applicable
    if (
      task.annotations &&
      !isEmpty(task.annotations) &&
      task.annotations.context_relevance &&
      !isEmpty(task.annotations.context_relevance)
    ) {
      const context_relevances = Object.values(
        task.annotations.context_relevance,
      );

      // Step 2.b: For each relevant context post aggregation
      for (const relevantContextIdx of aggregator.apply(context_relevances)) {
        if (!isEmpty(filters)) {
          filters.forEach((filter) => {
            if (task.hasOwnProperty(filter) && task[filter]) {
              if (Array.isArray(task[filter])) {
                task[filter].forEach((group) => {
                  add(relevantContextIndexes, {
                    key: `${relevantContextIdx + 1}`,
                    [filter]: group,
                  });
                });
              } else {
                add(relevantContextIndexes, {
                  key: `${relevantContextIdx + 1}`,
                  [filter]: task[filter],
                });
              }
            }
          });
        } else {
          add(relevantContextIndexes, {
            key: `${relevantContextIdx + 1}`,
          });
        }
      }
    }
  });

  // Step 3: Return
  return relevantContextIndexes;
}

async function computeStatistics(
  tasks: Task[],
  filters: { [key: string]: string[] },
  selectedAggregator,
  setStatistics,
  setLoading: Function,
) {
  const statistics = {
    input: {},
    tasks_distribution: {},
    contexts: {},
  };

  // Step 1: Calculate length of input in words
  statistics['input']['word_count'] = computeWordCount(
    tasks,
    Object.keys(filters),
  );

  // Step 2: Calculate number of utterance in input, if applicable
  statistics['input']['utterance_count'] = computeUtterances(
    tasks,
    filters ? Object.keys(filters) : [],
  );

  // Step 3: Calculate tasks per filter
  if (!isEmpty(filters)) {
    // Step 2.a: Initialize counter
    const taskDistributionPerFilter: {
      [key: string]: { [key: string]: number };
    } = Object.fromEntries(
      Object.entries(filters).map(([filterName, filterValues]) => [
        filterName,
        Object.fromEntries(filterValues.map((value) => [value, 0])),
      ]),
    );

    // Step 2.b: Iterate over tasks
    tasks.forEach((task) => {
      for (const filter of Object.keys(taskDistributionPerFilter)) {
        if (task.hasOwnProperty(filter)) {
          if (Array.isArray(task[filter])) {
            task[filter].forEach((value) => {
              taskDistributionPerFilter[filter][value] += 1;
            });
          } else {
            taskDistributionPerFilter[filter][task[filter]] += 1;
          }
        }
      }
    });

    // Step 2.c: Normalize and add to statistics
    Object.keys(taskDistributionPerFilter).forEach((filter) => {
      statistics['tasks_distribution'][filter] = normalize(
        taskDistributionPerFilter[filter],
      );
    });
  }

  // Step 4: Calculate context relevance
  const contextRelevance = computeContextRelevance(
    tasks,
    Object.keys(filters),
    selectedAggregator,
  );
  if (!isEmpty(contextRelevance)) {
    statistics['contexts']['relevance'] = contextRelevance;
  }

  // Step 4: Set statistics and set loading to "false"
  setStatistics(statistics);
  setLoading(false);
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function SkeletonGraphs({ keyValue }: { keyValue: string }) {
  return (
    <div key={keyValue} className={classes.row}>
      <ButtonSkeleton className={classes.viewBtn} />
      &nbsp;
      <div className={classes.graphsGrid}>
        <div key={'placeholder-statistics-1'} className={classes.graph}>
          <SkeletonText heading={true} width={'70%'} />
          <LineChart
            data={[]}
            options={{
              axes: {
                bottom: {
                  scaleType: ScaleTypes.TIME,
                },
                left: {
                  scaleType: ScaleTypes.LINEAR,
                },
              },
              curve: 'curveMonotoneX',
              width: '500px',
              height: '500px',
              toolbar: {
                enabled: false,
              },
              data: {
                loading: true,
              },
            }}
          ></LineChart>
        </div>
        <div key={'placeholder-statistics-2'} className={classes.graph}>
          <SkeletonText heading={true} width={'70%'} />
          <DonutChart
            data={[]}
            options={{
              width: '500px',
              height: '500px',
              toolbar: {
                enabled: false,
              },
              data: {
                loading: true,
              },
            }}
          ></DonutChart>
        </div>
        <div key={'placeholder-statistics-3'} className={classes.graph}>
          <SkeletonText heading={true} width={'70%'} />
          <GroupedBarChart
            data={[]}
            options={{
              axes: {
                left: {},
                bottom: {
                  scaleType: ScaleTypes.LABELS,
                },
              },
              data: { loading: true },
              width: '500px',
              height: '500px',
            }}
          ></GroupedBarChart>
        </div>
      </div>
    </div>
  );
}

function Histogram({
  records,
  filters,
  groupBy,
  setGroupBy,
  caption,
  xLabel,
  yLabel,
  theme = 'white',
  width = '500px',
  height = '500px',
}: {
  records: { [key: string]: any }[];
  filters: { [key: string]: string[] };
  groupBy: string | undefined;
  setGroupBy: Function;
  caption: string;
  xLabel: string;
  yLabel: string;
  theme?: string;
  width?: string;
  height?: string;
}) {
  // Step 1: Build data for histogram
  const data: { [key: string]: number | string }[] = [];
  records.forEach((record) => {
    if (groupBy) {
      if (record.hasOwnProperty(groupBy) && Array.isArray(record[groupBy])) {
        for (const group of record[groupBy]) {
          data.push({ count: record.count, group: group });
        }
      } else {
        data.push({ count: record.count, group: record[groupBy] });
      }
    } else {
      data.push({ count: record.count, group: 'All' });
    }
  });

  // Step 2: Render
  return (
    <div key={'statistics-word-count'} className={classes.graph}>
      <h5 className={classes.graphTitle}>
        <strong>{caption}</strong>
      </h5>
      {!isEmpty(filters) && (
        <Select
          id={`selector__word_count--groupby`}
          labelText="Group by"
          inline={true}
          onChange={(event) => {
            setGroupBy(event.target.value);
          }}
        >
          {Object.keys(filters).map((filter) => {
            return (
              <SelectItem
                key={`selector__word_count--groupby-${filter}`}
                value={filter}
                text={filter}
              />
            );
          })}
        </Select>
      )}
      <HistogramChart
        data={data}
        options={{
          axes: {
            left: {
              title: yLabel,
              scaleType: ScaleTypes.LINEAR,
              stacked: true,
              binned: true,
            },
            bottom: {
              title: xLabel,
              mapsTo: 'count',
              bins: 10,
              limitDomainToBins: true,
            },
          },
          width: width,
          height: height,
          toolbar: {
            enabled: false,
          },
          theme: theme,
        }}
      ></HistogramChart>
    </div>
  );
}

function TasksDistributionChart({
  distributions,
  filter,
  size = '400px',
  theme = 'white',
}: {
  distributions: { [key: string]: any };
  filter: string;
  size?: string;
  theme?: string;
}) {
  if (distributions.hasOwnProperty(filter)) {
    return (
      <div key={`statistics-${filter}`} className={classes.graph}>
        <h5 className={classes.graphTitle}>
          <strong>{filter}</strong>
        </h5>

        <DonutChart
          data={Object.entries(distributions[filter]).map(([group, value]) => {
            return { group: group, value: value };
          })}
          options={{
            width: size,
            height: size,
            donut: {
              center: {
                label: 'Tasks Distribution',
                number: 100,
                numberFormatter: (number) => number + '%',
              },
            },
            toolbar: {
              enabled: false,
            },
            theme: theme,
          }}
        ></DonutChart>
      </div>
    );
  } else {
    return null;
  }
}

function ContextRelevanceChart({
  records,
  filters,
  groupBy,
  setGroupBy,
  aggregators,
  setAggregator,
  caption,
  xLabel,
  yLabel,
  yDomain,
  theme = 'white',
  width = '500px',
  height = '500px',
}: {
  records: { key: string; value: number; group?: string }[];
  filters: { [key: string]: string[] };
  groupBy: string | undefined;
  setGroupBy: Function;
  aggregators: Aggregator[];
  setAggregator: Function;
  caption: string;
  xLabel: string;
  yLabel: string;
  yDomain?: number[];
  theme?: string;
  width?: string;
  height?: string;
}) {
  // Step 1: Build data for histogram
  const data: { key: string; value: number; group?: string }[] = [];
  records.forEach((record) => {
    if (groupBy) {
      if (record.hasOwnProperty(groupBy) && Array.isArray(record[groupBy])) {
        for (const group of record[groupBy]) {
          data.push({ ...record, group: group });
        }
      } else {
        data.push({ ...record, group: record[groupBy] });
      }
    } else {
      data.push({ ...record, group: 'All' });
    }
  });

  // Step 2: Sort data
  data.sort((a, b) => parseInt(a.key) - parseInt(b.key));

  // Step 2: Render
  return (
    <div key={'statistics-context-relevance'} className={classes.graph}>
      <h5 className={classes.graphTitle}>
        <strong>{caption}</strong>
      </h5>
      <div
        key={'statistics-context-relevance-selectors'}
        className={classes.selectors}
      >
        <Select
          id={`selector__context-relevance--aggregator`}
          labelText="Aggregator"
          inline={true}
          onChange={(event) => {
            const selectedAggregator = aggregators.find(
              (entry) => entry.name === event.target.value,
            );
            if (selectedAggregator) {
              setAggregator(selectedAggregator);
            }
          }}
        >
          {aggregators.map((aggregator) => {
            return (
              <SelectItem
                key={`selector__context-relevance--aggregator-${aggregator.name}`}
                value={aggregator.name}
                text={aggregator.displayName}
              />
            );
          })}
        </Select>
        {!isEmpty(filters) && (
          <Select
            id={`selector__context-relevance--groupby`}
            labelText="Group by"
            inline={true}
            onChange={(event) => {
              setGroupBy(event.target.value);
            }}
          >
            {Object.keys(filters).map((filter) => {
              return (
                <SelectItem
                  key={`selector__context-relevance--groupby-${filter}`}
                  value={filter}
                  text={filter}
                />
              );
            })}
          </Select>
        )}
      </div>

      <StackedBarChart
        data={data}
        options={{
          axes: {
            left: {
              title: yLabel,
              mapsTo: 'value',
              ...(yDomain && { domain: yDomain }),
            },
            bottom: {
              title: xLabel,
              mapsTo: 'key',
              scaleType: ScaleTypes.LABELS,
            },
          },
          width: width,
          height: height,
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
export default function DataCharacteristics({ tasks, filters }: Props) {
  // Step 1: Initialize state and necessary variables
  const [WindowWidth, setWindowWidth] = useState<number>(
    global?.window && window.innerWidth,
  );
  const [WindowHeight, setWindowHeight] = useState<number>(
    global?.window && window.innerHeight,
  );

  const [loading, setLoading] = useState<boolean>(true);
  const [statistics, setStatistics] = useState<{}>({});
  const [showTaskDistributionGraphs, setShowTaskDistributionGraphs] =
    useState<boolean>(true);
  const [showInputCharacteristicsGraphs, setShowInputCharacteristicsGraphs] =
    useState<boolean>(true);
  const [
    showContextsCharacteristicsGraphs,
    setShowContextsCharacteristicsGraphs,
  ] = useState<boolean>(true);
  const aggregators: Aggregator[] = [
    majorityUnionAggregator,
    unionAggregator,
    intersectionAggregator,
  ];
  const [selectedAggregator, setSelectedAggregator] = useState<Aggregator>(
    majorityUnionAggregator,
  );

  // Step 2: Run effects
  // Step 2.a: Adjust graph width & heigh based on window size
  useEffect(() => {
    // Step 1: Define window resize function
    const handleWindowResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
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

  // Step 2.b: Compute statistics
  useEffect(() => {
    computeStatistics(
      tasks,
      filters,
      selectedAggregator,
      setStatistics,
      setLoading,
    );
  }, [tasks, filters, selectedAggregator]);

  // Step 3: Configure depedent state variables
  const [wordCountGroupBy, setWordCountGroupBy] = useState<string | undefined>(
    filters ? Object.keys(filters)[0] : undefined,
  );
  const [utteranceCountGroupBy, setUtteranceCountGroupBy] = useState<
    string | undefined
  >(Object.keys(filters)[0]);
  const [contextRelevanceGroupBy, setContextRelevanceGroupBy] = useState<
    string | undefined
  >(Object.keys(filters)[0]);

  // Step 3: Render
  return (
    <div className={classes.page}>
      {loading ? (
        <div className={classes.row}>
          <SkeletonGraphs keyValue={'skeleton-graphs-1'} />
          <SkeletonGraphs keyValue={'skeleton-graphs-2'} />
        </div>
      ) : (
        <>
          {Object.keys(statistics['tasks_distribution']).length ? (
            <div className={classes.row}>
              <Tooltip
                label={'Click to toggle task distributions'}
                align={'right'}
                className={classes.viewBtnTooltip}
              >
                <Button
                  id={'view__task_distributions-btn'}
                  className={classes.viewBtn}
                  kind="ghost"
                  onClick={() => {
                    setShowTaskDistributionGraphs(!showTaskDistributionGraphs);
                  }}
                >
                  {showTaskDistributionGraphs ? (
                    <ChevronUp size={24} />
                  ) : (
                    <ChevronDown size={24} />
                  )}
                  <h4>Task Distribution</h4>
                </Button>
              </Tooltip>

              {showTaskDistributionGraphs && (
                <div
                  className={cx(
                    Object.keys(statistics['tasks_distribution']).length > 3
                      ? classes.graphsGrid
                      : classes.graphsFlex,
                  )}
                >
                  {Object.keys(statistics['tasks_distribution']).length > 0 &&
                  !isEmpty(filters)
                    ? Object.keys(filters).map((filter) => {
                        return (
                          <TasksDistributionChart
                            key={`task-distribution-chart--${filter}`}
                            distributions={statistics['tasks_distribution']}
                            filter={filter}
                            size={`${Math.min(Math.round(WindowWidth * 0.2), 450)}px`}
                            theme={theme}
                          />
                        );
                      })
                    : null}
                </div>
              )}
            </div>
          ) : null}

          {Object.keys(statistics['input']).length ? (
            <div className={classes.row}>
              <Tooltip
                label={'Click to toggle input characteristics'}
                align={'right'}
                className={classes.viewBtnTooltip}
              >
                <Button
                  id={'view__input-characteristics-btn'}
                  className={classes.viewBtn}
                  kind="ghost"
                  onClick={() => {
                    setShowInputCharacteristicsGraphs(
                      !showInputCharacteristicsGraphs,
                    );
                  }}
                >
                  {showInputCharacteristicsGraphs ? (
                    <ChevronUp size={24} />
                  ) : (
                    <ChevronDown size={24} />
                  )}
                  <h4>Input Characteristics</h4>
                </Button>
              </Tooltip>

              {showInputCharacteristicsGraphs && (
                <div className={cx(classes.graphsFlex)}>
                  {statistics['input'].hasOwnProperty('word_count') &&
                    statistics['input']['word_count'] && (
                      <Histogram
                        records={statistics['input']['word_count']}
                        filters={filters}
                        groupBy={wordCountGroupBy}
                        setGroupBy={setWordCountGroupBy}
                        caption={'Number of Words'}
                        xLabel="Number of Words"
                        yLabel="Number of Tasks"
                        theme={theme}
                        width={
                          Object.keys(statistics['input']).length === 1
                            ? `${Math.round(WindowWidth * 0.4)}px`
                            : '600px'
                        }
                        height={
                          Object.keys(statistics['input']).length === 1
                            ? `${Math.round(WindowHeight * 0.4)}px`
                            : '600px'
                        }
                      />
                    )}
                  {statistics['input'].hasOwnProperty('utterance_count') &&
                  statistics['input']['utterance_count'].length ? (
                    <Histogram
                      records={statistics['input']['utterance_count']}
                      filters={filters}
                      groupBy={utteranceCountGroupBy}
                      setGroupBy={setUtteranceCountGroupBy}
                      caption={'Number of Utterances'}
                      xLabel="Number of Utterances"
                      yLabel="Number of Tasks"
                      theme={theme}
                      width={
                        Object.keys(statistics['input']).length === 1
                          ? `${Math.round(WindowWidth * 0.4)}px`
                          : '600px'
                      }
                      height={
                        Object.keys(statistics['input']).length === 1
                          ? `${Math.round(WindowHeight * 0.4)}px`
                          : '600px'
                      }
                    />
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {Object.keys(statistics['contexts']).length ? (
            <div className={classes.row}>
              <Tooltip
                label={'Click to toggle contexts characteristics'}
                align={'right'}
                className={classes.viewBtnTooltip}
              >
                <Button
                  id={'view__contexts-characteristics-btn'}
                  className={classes.viewBtn}
                  kind="ghost"
                  onClick={() => {
                    setShowContextsCharacteristicsGraphs(
                      !showContextsCharacteristicsGraphs,
                    );
                  }}
                >
                  {showContextsCharacteristicsGraphs ? (
                    <ChevronUp size={24} />
                  ) : (
                    <ChevronDown size={24} />
                  )}
                  <h4>Contexts Characteristics</h4>
                </Button>
              </Tooltip>

              {showContextsCharacteristicsGraphs && (
                <div className={cx(classes.graphsFlex)}>
                  {statistics['contexts'].hasOwnProperty('relevance') &&
                    !isEmpty(statistics['contexts']['relevance']) && (
                      <ContextRelevanceChart
                        records={statistics['contexts']['relevance']}
                        filters={filters}
                        groupBy={contextRelevanceGroupBy}
                        setGroupBy={setContextRelevanceGroupBy}
                        aggregators={aggregators}
                        setAggregator={setSelectedAggregator}
                        caption={'Relevance'}
                        xLabel="Context Index"
                        yLabel="Number of Tasks"
                        yDomain={[0, tasks.length]}
                        theme={theme}
                        width={
                          Object.keys(statistics['contexts']).length === 1
                            ? `${Math.round(WindowWidth * 0.4)}px`
                            : '600px'
                        }
                        height={
                          Object.keys(statistics['contexts']).length === 1
                            ? `${Math.round(WindowHeight * 0.4)}px`
                            : '600px'
                        }
                      />
                    )}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
