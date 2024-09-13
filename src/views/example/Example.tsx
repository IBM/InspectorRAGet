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
import cx from 'classnames';
import { useEffect, useMemo, useState, memo } from 'react';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from '@carbon/react';
import {
  DataVis_4,
  StringText,
  ChartRadar,
  UserData,
  ChartMultitype,
  Compare,
  HeatMap_03,
} from '@carbon/icons-react';

import { Data, TaskEvaluation } from '@/src/types';
import { calculateAggregateValue } from '@/src/utilities/metrics';
import { useDataStore } from '@/src/store';
import { useBackButton } from '@/src/hooks/useBackButton';

import Task from '@/src/views/task/Task';
import ExperimentTile from '@/src/components/example-tile/ExampleTile';
import DisabledTab from '@/src/components/disabled/DisabledTab';
import DataCharacteristics from '@/src/views/data-characteristics/DataCharacteristics';
import PredictionsTable from '@/src/views/predictions-table/PredictionsTable';
import PerformanceOverview from '@/src/views/performance-overview/PerformanceOverview';
import AnnotatorBehavior from '@/src/views/annotator-behavior/AnnotatorBehavior';
import ModelBehavior from '@/src/views/model-behavior/ModelBehavior';
import ModelComparator from '@/src/views/model-comparator/ModelComparator';
import MetricBehavior from '@/src/views/metric-behavior/MetricBehavior';

import classes from './Example.module.scss';

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default memo(function Example({ data }: { data: Data }) {
  // Step 1: Initialize state and necessary variables
  const [seletedTaskId, setSelectedTaskId] = useState<string | undefined>(
    undefined,
  );

  // Step 2: Run effects
  // Step 2.a: Set example data in data store
  const { set: setData } = useDataStore();
  useEffect(() => {
    setData(data);
  }, [data]);

  // Step 2.b: Restrict to `numerical` and `categorical` metrics
  const [eligibleMetricsMap, eligibleMetrics] = useMemo(() => {
    const metricMap = Object.fromEntries(
      data.metrics
        .filter(
          (metric) =>
            metric.type === 'numerical' || metric.type === 'categorical',
        )
        .map((metric) => [metric.name, metric]),
    );
    return [metricMap, Object.values(metricMap)];
  }, [data.metrics]);

  // Step 2.c: Build evaluations for each metric
  const [evaluationsPerMetric, filters] = useMemo(() => {
    // Step 2.c.i: Initialize model names, tasks map, queries map (used to visualize task-table), applicable filters and evaluations per metric map
    const modelNames: { [key: string]: string } = Object.fromEntries(
      data.models.map((model) => [model.modelId, model.name]),
    );
    const tasks = new Map<string, any>();
    const queries = new Map<string, string>();
    const applicableFilters: { [key: string]: Set<string> } = data.filters
      ? Object.fromEntries(
          data.filters.map((filter) => [filter, new Set<string>()]),
        )
      : {};
    const evaluationsPerMetricMap: { [key: string]: TaskEvaluation[] } = {};

    // Step 2.c.ii: Iterate over each task to populate tasks map, queries map and applicable filters
    data.tasks.forEach((task) => {
      // Step 1.c.ii.*: Add to tasks map
      tasks.set(task.taskId, task);

      // Step 1.c.ii.**: Add to queries map
      if (typeof task.input === 'string') {
        queries.set(task.taskId, task.input);
      } else if (Array.isArray(task.input)) {
        queries.set(task.taskId, task.input[task.input.length - 1].text);
      } else {
        queries.set(task.taskId, task.taskId);
      }

      // Step 1.c.ii.***: Add filters with value, if requested
      if (data.filters) {
        for (const filter of data.filters) {
          if (task.hasOwnProperty(filter)) {
            const value = task[filter];
            if (typeof value === 'string') {
              applicableFilters[filter].add(value);
            } else if (Array.isArray(value)) {
              value.forEach((v) => {
                if (typeof v === 'string') {
                  applicableFilters[filter].add(v);
                }
              });
            }
          }
        }
      }
    });

    // Step 2.c.iii: Remove filters with single value
    for (const key in applicableFilters) {
      if (applicableFilters[key].size < 2) {
        delete applicableFilters[key];
      }
    }

    // Step 2.c.iv: Iterate over each evaluation
    data.evaluations?.forEach((evaluation) => {
      // Step 1.c.iv.*: Fetch relevant task
      const task = tasks.get(evaluation.taskId);

      // Step 1.c.iv.**: Indentify values for applicable filters for the current task
      const filters = {};
      if (task && !isEmpty(applicableFilters)) {
        for (const filter in applicableFilters) {
          if (task.hasOwnProperty(filter)) {
            filters[filter] = task[filter];
          }
        }
      }

      // Step 1.c.iv.***: Iterate over each annotation
      for (const metricName in evaluation.annotations) {
        // Process only eligible metrics
        if (!eligibleMetricsMap.hasOwnProperty(metricName)) {
          continue;
        }

        // Compute agreement statistics
        const aggregateStatistic = calculateAggregateValue(
          eligibleMetricsMap[metricName],
          evaluation.annotations[metricName],
        );

        // Create metric wise evaluations object
        if (evaluationsPerMetricMap.hasOwnProperty(metricName)) {
          evaluationsPerMetricMap[metricName] = [
            ...evaluationsPerMetricMap[metricName],
            {
              taskId: evaluation.taskId,
              modelId: evaluation.modelId,
              modelResponse: evaluation.modelResponse,
              annotations: evaluation.annotations,
              [metricName]: evaluation.annotations[metricName],
              ...(aggregateStatistic && {
                [`${metricName}_agg`]: aggregateStatistic,
              }),
              ...(queries.has(evaluation.taskId) && {
                query: queries.get(evaluation.taskId),
              }),
              ...filters,
            },
          ];
        } else {
          evaluationsPerMetricMap[metricName] = [
            {
              taskId: evaluation.taskId,
              modelId: evaluation.modelId,
              modelResponse: evaluation.modelResponse,
              annotations: evaluation.annotations,
              [metricName]: evaluation.annotations[metricName],
              ...(aggregateStatistic && {
                [`${metricName}_agg`]: aggregateStatistic,
              }),
              ...(queries.has(evaluation.taskId) && {
                query: queries.get(evaluation.taskId),
              }),
              ...filters,
            },
          ];
        }
      }
    });

    // Step 2.c.v: Sort evaluations based on model
    for (const evaluations of Object.values(evaluationsPerMetricMap)) {
      evaluations.sort((a, b) => {
        // Step 2.c.v.*: Compare model names, if available
        if (
          modelNames.hasOwnProperty(a.modelId) &&
          modelNames.hasOwnProperty(b.modelId)
        ) {
          return modelNames[a.modelId].localeCompare(modelNames[b.modelId]);
        }

        // Step 2.c.v.**: Compare model IDs (Fallback)
        return a.modelId.localeCompare(b.modelId);
      });
    }

    // Step 2.c.vi: Return
    return [
      evaluationsPerMetricMap,
      Object.fromEntries(
        Object.entries(applicableFilters).map(([filter, vals]) => [
          filter,
          [...vals],
        ]),
      ),
    ];
  }, [data.evaluations, data.tasks, data.models, eligibleMetricsMap]);

  const { } = useBackButton();

  // Step 3: Return
  return (
    <div className={classes.page}>
      <div className={cx(classes.taskOverlay, seletedTaskId && classes.active)}>
        {seletedTaskId && (
          <Task
            taskId={seletedTaskId}
            onClose={() => {
              setSelectedTaskId(undefined);
            }}
          />
        )}
      </div>

      <div className={classes.headerContainer}>
        <ExperimentTile
          data={data}
          disableNavigation={true}
          disableActions={true}
          expanded={false}
        />
      </div>
      <div className={classes.analysisContainer}>
        <Tabs>
          <TabList
            className={classes.tabList}
            aria-label="Metrics tab"
            contained
          >
            <Tab key={'data-characteristics-tab'} renderIcon={DataVis_4}>
              Data Characteristics
            </Tab>
            <Tab key={'predictions-tab'} renderIcon={StringText}>
              Predictions
            </Tab>
            <Tab key={'annotator-behavior-tab'} renderIcon={UserData}>
              Annotator Behavior
            </Tab>
            <Tab key={'overview-tab'} renderIcon={ChartRadar}>
              Performance Overview
            </Tab>
            <Tab key={'model-behavior-tab'} renderIcon={ChartMultitype}>
              Model Behavior
            </Tab>
            <Tab key={'model-comparator-tab'} renderIcon={Compare}>
              Model Comparator
            </Tab>
            <Tab key={'metric-behavior-tab'} renderIcon={HeatMap_03}>
              Metric Behavior
            </Tab>
          </TabList>
          <TabPanels>
            <TabPanel key={'data-characteristics-panel'}>
              <DataCharacteristics
                tasks={data.tasks}
                filters={filters}
              ></DataCharacteristics>
            </TabPanel>
            <TabPanel key={'predictions-panel'}>
              <PredictionsTable
                tasks={data.tasks}
                models={data.models}
                evaluations={data.evaluations}
                filters={filters}
              ></PredictionsTable>
            </TabPanel>
            <TabPanel key={'annotator-behavior-panel'}>
              <AnnotatorBehavior
                evaluationsPerMetric={evaluationsPerMetric}
                models={data.models}
                metrics={data.metrics.filter(
                  (metric) => metric.author === 'human',
                )}
                filters={filters}
              ></AnnotatorBehavior>
            </TabPanel>
            <TabPanel key={'performance-overview-panel'}>
              <PerformanceOverview
                evaluationsPerMetric={evaluationsPerMetric}
                models={data.models}
                metrics={eligibleMetrics}
                filters={filters}
                numTasks={data.numTasks}
              ></PerformanceOverview>
            </TabPanel>
            <TabPanel key={'model-behavior-panel'}>
              <ModelBehavior
                evaluationsPerMetric={evaluationsPerMetric}
                models={data.models}
                metrics={eligibleMetrics}
                filters={filters}
                onTaskSelection={(taskId) => {
                  setSelectedTaskId(taskId);
                }}
              ></ModelBehavior>
            </TabPanel>
            <TabPanel key={'model-comparator-panel'}>
              {data.models.length == 1 ? (
                <DisabledTab
                  message={
                    'Nothing to see here in absence of multiple models.'
                  }
                />
              ) : (
                <ModelComparator
                  evaluationsPerMetric={evaluationsPerMetric}
                  models={data.models}
                  metrics={eligibleMetrics}
                  filters={{}}
                  onTaskSelection={(taskId) => {
                    setSelectedTaskId(taskId);
                  }}
                ></ModelComparator>
              )}
            </TabPanel>
            <TabPanel key={'conditional-view'}>
              {eligibleMetrics.length == 1 ? (
                <DisabledTab message="Nothing to see here in absence of multiple metrics." />
              ) : (
                <MetricBehavior
                  evaluationsPerMetric={evaluationsPerMetric}
                  models={data.models}
                  metrics={eligibleMetrics}
                  filters={{}}
                ></MetricBehavior>
              )}
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
});
