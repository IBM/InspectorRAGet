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

import { memo } from 'react';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from '@carbon/react';
import {
  StringText,
  ChartRadar,
  UserData,
  ChartMultitype,
  Compare,
  HeatMap_03,
} from '@carbon/icons-react';

import SkeletonExampleTile from '@/src/components/example-tile/SkeletonExampleTile';
import SkeletonPredictionsTable from '@/src/views/predictions-table/SkeletonPredictionsTable';
import SkeletonPerformanceOverview from '@/src/views/performance-overview/SkeletonPerformanceOverview';

import styles from './Example.module.scss';

export default memo(function SkeletonExample() {
  return (
    <div className={styles.page}>
      <div className={styles.headerContainer}>
        <SkeletonExampleTile disableNavigation={true} disableActions={true} />
      </div>
      <div className={styles.analysisContainer}>
        <Tabs>
          <TabList
            className={styles.tabList}
            aria-label="Metrics tab"
            contained
          >
            <Tab key={'predictions-tab'} renderIcon={StringText}>
              Predictions
            </Tab>
            <Tab key={'overview-tab'} renderIcon={ChartRadar}>
              Performance Overview
            </Tab>
            <Tab key={'annotator-behavior-tab'} renderIcon={UserData}>
              Annotator Behavior
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
            <TabPanel key={'predictions-panel'}>
              <SkeletonPredictionsTable />
            </TabPanel>
            <TabPanel key={'performance-overview-panel'}>
              <SkeletonPerformanceOverview />
            </TabPanel>
            <TabPanel key={'annotator-behavior-panel'}></TabPanel>
            <TabPanel key={'model-behavior-panel'}></TabPanel>
            <TabPanel key={'model-comparator-panel'}></TabPanel>
            <TabPanel key={'conditional-view'}></TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
});
