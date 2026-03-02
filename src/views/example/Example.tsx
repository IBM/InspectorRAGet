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
import ExampleTile from '@/src/components/example-tile/ExampleTile';
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
  const [seletedTaskId, setSelectedTaskId] = useState<string | undefined>(
    undefined,
  );

  const { set: setData } = useDataStore();
  useEffect(() => {
    setData(data);
  }, [data]);

  // Only numerical and categorical metrics are eligible for aggregate views
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

  const [evaluationsPerMetric, filters] = useMemo(() => {
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

    data.tasks.forEach((task) => {
      tasks.set(task.taskId, task);

      // Extract a display-friendly query string from the task input
      if (typeof task.input === 'string') {
        queries.set(task.taskId, task.input);
      } else if (
        Array.isArray(task.input) &&
        task.input[task.input.length - 1].hasOwnProperty('text') &&
        task.input[task.input.length - 1]['text']
      ) {
        queries.set(task.taskId, task.input[task.input.length - 1]['text']);
      } else if (
        Array.isArray(task.input) &&
        task.input[task.input.length - 1].hasOwnProperty('role') &&
        (task.input[task.input.length - 1]['role'] === 'system' ||
          task.input[task.input.length - 1]['role'] === 'developer' ||
          task.input[task.input.length - 1]['role'] === 'user' ||
          task.input[task.input.length - 1]['role'] === 'assistant') &&
        task.input[task.input.length - 1].hasOwnProperty('content') &&
        task.input[task.input.length - 1]['content']
      ) {
        queries.set(task.taskId, task.input[task.input.length - 1]['content']);
      } else {
        queries.set(task.taskId, task.taskId);
      }

      // Collect filter values from each task for the applicable filters
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

    // Filters with fewer than 2 distinct values are not useful for filtering
    for (const key in applicableFilters) {
      if (applicableFilters[key].size < 2) {
        delete applicableFilters[key];
      }
    }

    data.evaluations?.forEach((evaluation) => {
      const task = tasks.get(evaluation.taskId);

      // Attach applicable filter values from the task to each evaluation entry
      const filters = {};
      if (task && !isEmpty(applicableFilters)) {
        for (const filter in applicableFilters) {
          if (task.hasOwnProperty(filter)) {
            filters[filter] = task[filter];
          }
        }
      }

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

    for (const evaluations of Object.values(evaluationsPerMetricMap)) {
      evaluations.sort((a, b) => {
        if (
          modelNames.hasOwnProperty(a.modelId) &&
          modelNames.hasOwnProperty(b.modelId)
        ) {
          return modelNames[a.modelId].localeCompare(modelNames[b.modelId]);
        }

        // Fall back to comparing model IDs
        return a.modelId.localeCompare(b.modelId);
      });
    }

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

  const {} = useBackButton();

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
        <ExampleTile data={data} disableNavigation={true} expanded={false} />
      </div>
      <div className={classes.analysisContainer}>
        <Tabs>
          <TabList
            className={classes.tabList}
            aria-label="Metrics tab"
            contained
            fullWidth
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
                  message={'Nothing to see here in absence of multiple models.'}
                />
              ) : (
                <ModelComparator
                  evaluationsPerMetric={evaluationsPerMetric}
                  models={data.models}
                  metrics={eligibleMetrics}
                  filters={filters}
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
                  filters={filters}
                  onTaskSelection={(taskId) => {
                    setSelectedTaskId(taskId);
                  }}
                ></MetricBehavior>
              )}
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
});
