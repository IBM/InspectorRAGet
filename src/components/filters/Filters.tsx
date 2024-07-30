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

import { isEmpty, omit } from 'lodash';
import cx from 'classnames';
import { useState, useEffect } from 'react';

import { FilterableMultiSelect, Tag, Tooltip, Button } from '@carbon/react';
import { ChevronUp, ChevronDown, Filter } from '@carbon/icons-react';

import classes from './Filters.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  keyPrefix: string;
  filters: { [key: string]: string[] };
  selectedFilters: { [key: string]: string[] };
  setSelectedFilters: Function;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function Filters({
  keyPrefix,
  filters,
  selectedFilters,
  setSelectedFilters,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [showFilters, setShowFilters] = useState<boolean>(true);

  // Step 2: Run effects
  // Step 2.a: If no filters are found, set show filters to false
  useEffect(() => {
    if (filters === undefined) {
      setShowFilters(false);
    }
  }, [filters]);

  // Step 3: Render
  return (
    <>
      {filters && (
        <Tooltip
          label={'Click to toggle filters'}
          align={'right'}
          className={classes.filtersBtnTooltip}
        >
          <Button
            id={`${keyPrefix}-filters`}
            className={classes.filtersBtn}
            kind={'ghost'}
            size={'sm'}
            onClick={() => {
              setShowFilters(!showFilters);
            }}
            disabled={!filters}
          >
            <div className={classes.filtersBtnElements}>
              {showFilters ? (
                <ChevronUp size={24} />
              ) : (
                <ChevronDown size={24} />
              )}
              <div className={classes.filtersBtnCaptionElements}>
                <h5>Additional Filters</h5>
                <Filter />
              </div>
            </div>
          </Button>
        </Tooltip>
      )}
      <div className={cx(classes.filters, showFilters && classes.visible)}>
        {showFilters &&
          filters &&
          Object.entries(filters).map(([filterType, values]) => {
            return (
              <div
                key={`${keyPrefix}-filter` + filterType + '-selector'}
                className={classes.filterSelector}
              >
                <FilterableMultiSelect
                  id={`${keyPrefix}-filter` + filterType + '-selector'}
                  titleText={filterType}
                  items={values}
                  itemToString={(item) => String(item)}
                  onChange={(event) => {
                    setSelectedFilters((prevState) =>
                      isEmpty(event.selectedItems)
                        ? omit(prevState, filterType)
                        : {
                            ...prevState,
                            [filterType]: event.selectedItems,
                          },
                    );
                  }}
                ></FilterableMultiSelect>
                {Object.keys(selectedFilters).includes(filterType) ? (
                  <div>
                    {selectedFilters[filterType].map((value) => {
                      return (
                        <Tag
                          type={'cool-gray'}
                          key={`${keyPrefix}-filter-value` + value}
                        >
                          {value}
                        </Tag>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
      </div>
    </>
  );
}
