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

import { sampleSize, isEmpty } from 'lodash';
import DOMPurify from 'dompurify';
import parse from 'html-react-parser';
import { useMemo, useState, useEffect } from 'react';
import {
  FilterableMultiSelect,
  Tag,
  Toggle,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Pagination,
} from '@carbon/react';
import { WarningAlt, WarningAltFilled } from '@carbon/icons-react';

import { Task, Model, TaskEvaluation } from '@/src/types';
import { truncate } from '@/src/utilities/strings';
import { areObjectsIntersecting } from '@/src/utilities/objects';
import Filters from '@/src/components/filters/Filters';

import classes from './PredictionsTable.module.scss';

const MAX_NUM_ROWS = 150;

// ===================================================================================
//                               COMPUTE FUNCTIONS
// ===================================================================================
/**
 * Helper function to compute evaluations table headers and rows
 * @param tasks eligible tasks
 * @param evaluations full set of evaluations
 * @returns
 */
function populateTableRows(
  tasks: Task[],
  evaluations: TaskEvaluation[],
  eligibleTaskIDs: Set<string>,
) {
  // Step 1: Collate predictions per task
  const evaluationsPerTask = new Map<string, TaskEvaluation[]>();
  evaluations.forEach((evaluation) => {
    if (eligibleTaskIDs.has(evaluation.taskId)) {
      const evaluationsForTask = evaluationsPerTask.get(evaluation.taskId);
      if (evaluationsForTask) {
        evaluationsPerTask.set(evaluation.taskId, [
          ...evaluationsForTask,
          evaluation,
        ]);
      } else {
        evaluationsPerTask.set(evaluation.taskId, [evaluation]);
      }
    }
  });

  // Step 2: Formulate rows
  const rows: { [key: string]: string }[] = [];
  tasks.forEach((task) => {
    if (eligibleTaskIDs.has(task.taskId)) {
      // Step 2.a: Add query string
      const row = { id: task.taskId, task: task.taskId };
      if (typeof task.input === 'string') {
        row['task'] = truncate(task.input, 80);
      } else if (Array.isArray(task.input)) {
        row['task'] = truncate(task.input[task.input.length - 1].text, 80);
      }

      // Step 2.b: Add first target, if present
      if (task.targets && !isEmpty(task.targets)) {
        row['targets'] = task.targets
          .map((target) => [target.text])
          .filter((entry) => entry !== undefined);
      }
      // Step 3.b: Add model responses
      const taskEvaluations = evaluationsPerTask.get(task.taskId);
      if (taskEvaluations) {
        taskEvaluations.forEach((evaluation) => {
          row[evaluation.modelId] = evaluation.modelResponse;
        });
      }

      // Step 2.c: Add formulated row
      rows.push(row);
    }
  });

  // Step 3: Return
  return rows;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function PredictionsTable({
  tasks,
  models,
  evaluations,
  filters,
}: {
  tasks: Task[];
  models: Model[];
  evaluations: TaskEvaluation[];
  filters: { [key: string]: string[] };
}) {
  // Step 1: Initialize state and necessary variables
  const [selectedModels, setSelectedModels] = useState<Model[]>(models);
  const [showTargets, setShowTargets] = useState<boolean>(true);
  const [showWarning, setShowWarning] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedFilters, setSelectedFilters] = useState<{
    [key: string]: string[];
  }>({});
  const [visibleRows, setVisibleRows] = useState<{ [key: string]: string }[]>(
    [],
  );

  // Step 2: Run effects
  // Step 2.a: Identify eligible task IDs based on selected filters
  const eligibleTaskIDs = useMemo(() => {
    if (!isEmpty(selectedFilters)) {
      const taskIds: Set<string> = new Set<string>();
      tasks.forEach((task) => {
        if (areObjectsIntersecting(selectedFilters, task)) {
          taskIds.add(task.taskId);
        }
      });

      return taskIds;
    } else {
      return new Set<string>(tasks.map((task) => task.taskId));
    }
  }, [tasks, selectedFilters]);

  // Step 2.b: Populate table rows
  const rows = useMemo(() => {
    const tableRows = populateTableRows(tasks, evaluations, eligibleTaskIDs);
    if (tableRows.length > MAX_NUM_ROWS) {
      // Add warning to indicate that only limited rows are shown, if not visible already
      if (!showWarning) {
        setShowWarning(true);
      }

      // Limit number of rows
      return sampleSize(tableRows, MAX_NUM_ROWS);
    } else {
      // Remove previsouly set warning, if necessary
      if (showWarning) {
        setShowWarning(false);
      }

      return tableRows;
    }
  }, [tasks, evaluations, showWarning, eligibleTaskIDs]);

  // Step 2.c: Adjust headers based on selectedModels and show target flat
  const headers = useMemo(() => {
    return [
      {
        key: 'task',
        header: 'Task',
      },
      showTargets
        ? {
            key: 'targets',
            header: 'Targets',
          }
        : null,
      ...selectedModels.map((model) => {
        return { key: model.modelId, header: `${model.name} prediction` };
      }),
    ].filter(Boolean);
  }, [showTargets, selectedModels]);

  // Step 2.d: Set visble rows
  useEffect(() => {
    // Set visible rows
    setVisibleRows(
      rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    );
  }, [rows, page, pageSize]);

  // Step 3: Render
  return (
    <>
      {headers && rows && (
        <div className={classes.page}>
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
                invalidText={'You must select a model to view predictions.'}
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
            <div className={classes.toggle}>
              <Toggle
                labelText="Show targets"
                labelA="No"
                labelB="Yes"
                defaultToggled={showTargets}
                id="show-targets-toggle"
                onToggle={() => {
                  setShowTargets(!showTargets);
                }}
              />
            </div>
          </div>
          {!isEmpty(filters) ? (
            <Filters
              keyPrefix="PredictionTable"
              filters={filters}
              selectedFilters={selectedFilters}
              setSelectedFilters={setSelectedFilters}
            />
          ) : null}

          {showWarning ? (
            <div className={classes.hintContainer}>
              <WarningAltFilled
                height={'16px'}
                width={'16px'}
                className={classes.hintContainerIcon}
              />
              <span className={classes.hintContainerText}>
                {`Only showing predictions for ${MAX_NUM_ROWS} out of ${eligibleTaskIDs.size} tasks`}
              </span>
            </div>
          ) : null}
          {eligibleTaskIDs.size ? (
            <>
              <DataTable rows={visibleRows} headers={headers} isSortable>
                {({
                  rows,
                  headers,
                  getTableProps,
                  getHeaderProps,
                  getRowProps,
                }) => (
                  <TableContainer className={classes.table}>
                    <Table {...getTableProps()}>
                      <TableHead>
                        <TableRow>
                          {headers.map((header, index) => (
                            <TableHeader
                              key={'header--' + index}
                              {...getHeaderProps({ header })}
                            >
                              {header.header}
                            </TableHeader>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((row, index) => (
                          <TableRow
                            key={'row--' + index}
                            {...getRowProps({ row })}
                          >
                            {row.cells.map((cell) => (
                              <TableCell key={cell.id}>
                                {cell.info.header === 'targets' && cell.value
                                  ? cell.value.length > 1
                                    ? cell.value.map(
                                        (targetText, targetIdx) => (
                                          <>
                                            <span>
                                              Target {targetIdx + 1}
                                              :&nbsp;
                                              {parse(
                                                DOMPurify.sanitize(targetText),
                                              )}
                                            </span>
                                            <div
                                              className={
                                                classes.targetSeparator
                                              }
                                            />
                                          </>
                                        ),
                                      )
                                    : parse(DOMPurify.sanitize(cell.value[0]))
                                  : parse(DOMPurify.sanitize(cell.value))}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </DataTable>
              <Pagination
                className={classes.pagination}
                pageSizes={[10, 25, 50, 100, 200]}
                totalItems={rows.length}
                onChange={(event: any) => {
                  // Step 1: Update page size
                  setPageSize(event.pageSize);
                  // Step 2: Update page
                  setPage(event.page);
                }}
              ></Pagination>
            </>
          ) : (
            <div className={classes.warningContainer}>
              <WarningAlt
                height={'32px'}
                width={'32px'}
                className={classes.warningContainerIcon}
              />
              <span className={classes.warningContainerText}>
                {`No matching tasks found. ${!isEmpty(selectedFilters) ? 'Please try again by removing one or more additional filters.' : ''}`}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
