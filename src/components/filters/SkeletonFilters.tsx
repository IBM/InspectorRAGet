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

import cx from 'classnames';

import { SelectSkeleton, TagSkeleton, Tooltip, Button } from '@carbon/react';
import { ChevronUp, Filter } from '@carbon/icons-react';

import classes from './Filters.module.scss';

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function SkeletonFilters() {
  return (
    <>
      <Tooltip
        label={'Click to toggle filters'}
        align={'right'}
        className={classes.filtersBtnTooltip}
      >
        <Button
          id={`skeleton-filters`}
          className={classes.filtersBtn}
          kind={'ghost'}
          size={'sm'}
        >
          <div className={classes.filtersBtnElements}>
            <ChevronUp size={24} />
            <div className={classes.filtersBtnCaptionElements}>
              <h5>Additional Filters</h5>
              <Filter />
            </div>
          </div>
        </Button>
      </Tooltip>

      <div className={cx(classes.filters, classes.visible)}>
        {['1', '2', '3'].map((filter) => {
          return (
            <div
              key={`$filter-` + filter + '-selector'}
              className={classes.filterSelector}
              style={{ width: '15%' }}
            >
              <SelectSkeleton />
              <TagSkeleton />
            </div>
          );
        })}
      </div>
    </>
  );
}
