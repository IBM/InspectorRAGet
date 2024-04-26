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

import {
  SelectSkeleton,
  DataTableSkeleton,
  ToggleSkeleton,
} from '@carbon/react';

import SkeletonFilters from '@/src/components/filters/SkeletonFilters';

import classes from './PredictionsTable.module.scss';

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function SkeletonPredictionsTable() {
  return (
    <div className={classes.page}>
      <div className={classes.selectors}>
        <div className={classes.modelSelector}>
          <SelectSkeleton />
        </div>
        <div className={classes.toggle}>
          <ToggleSkeleton />
        </div>
      </div>
      <SkeletonFilters />
      <DataTableSkeleton columnCount={4} rowCount={5}></DataTableSkeleton>
    </div>
  );
}
