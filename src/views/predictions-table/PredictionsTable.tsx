/**
 *
 * Copyright 2023-present InspectorRAGet Team
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

import {
  Task,
  Model,
  ModelResult,
  ToolCallRecord,
  outputAsText,
} from '@/src/types';
import { truncate } from '@/src/utilities/strings';
import { areObjectsIntersecting } from '@/src/utilities/objects';
import Filters from '@/src/components/filters/Filters';

import classes from './PredictionsTable.module.scss';

const MAX_NUM_ROWS = 150;

// --- Helpers ---

// Renders a tool call as a compact readable signature: get_weather(city="Boston")
function formatCallSignature(call: ToolCallRecord): string {
  const args = Object.entries(call.arguments)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ');
  return `${call.name}(${args})`;
}

// --- Compute functions ---

/** Build table rows from the task list, attaching model predictions for each eligible task. */
function populateTableRows(
  tasks: Task[],
  results: ModelResult[],
  eligibleTaskIDs: Set<string>,
) {
  // Collate results per task
  const resultsPerTask = new Map<string, ModelResult[]>();
  results.forEach((result) => {
    if (eligibleTaskIDs.has(result.taskId)) {
      const existingResults = resultsPerTask.get(result.taskId);
      if (existingResults) {
        resultsPerTask.set(result.taskId, [...existingResults, result]);
      } else {
        resultsPerTask.set(result.taskId, [result]);
      }
    }
  });

  const rows: { [key: string]: string }[] = [];
  tasks.forEach((task) => {
    if (eligibleTaskIDs.has(task.taskId)) {
      const row = { id: task.taskId, task: task.taskId };
      if (typeof task.input === 'string') {
        row['task'] = truncate(task.input, 80);
      } else if (Array.isArray(task.input)) {
        if (task.input[task.input.length - 1].hasOwnProperty('text')) {
          // Legacy utterance format { speaker, text }
          row['task'] = truncate(task.input[task.input.length - 1]['text'], 80);
        } else {
          // OpenAI message format — show the last user message so tool/assistant
          // turns at the end of the thread don't obscure the actual question.
          const lastUserMsg = [...task.input]
            .reverse()
            .find((m) => m.role === 'user');
          if (lastUserMsg?.content) {
            row['task'] = truncate(lastUserMsg['content'], 80);
          }
        }
      }

      // Add first target, if present. Render text targets as strings and
      // tool_calls targets as compact function signatures.
      if (task.targets && !isEmpty(task.targets)) {
        row['targets'] = task.targets
          .map((target) => {
            if (target.type === 'text') return [target.value];
            if (target.type === 'tool_calls')
              return [target.calls.map(formatCallSignature).join(', ')];
            return [];
          })
          .filter((entry) => entry.length > 0);
      }

      // Add model responses — render tool_calls output as function signatures.
      const taskResults = resultsPerTask.get(task.taskId);
      if (taskResults) {
        taskResults.forEach((result) => {
          row[result.modelId] =
            result.output.type === 'tool_calls'
              ? result.output.calls.map(formatCallSignature).join(', ')
              : outputAsText(result.output);
        });
      }

      rows.push(row);
    }
  });

  return rows;
}

// --- Main component ---

export default function PredictionsTable({
  tasks,
  models,
  results,
  filters,
}: {
  tasks: Task[];
  models: Model[];
  results: ModelResult[];
  filters: { [key: string]: string[] };
}) {
  const [selectedModels, setSelectedModels] = useState<Model[]>(models);
  const [showTargets, setShowTargets] = useState<boolean>(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedFilters, setSelectedFilters] = useState<{
    [key: string]: string[];
  }>({});
  const [visibleRows, setVisibleRows] = useState<{ [key: string]: string }[]>(
    [],
  );

  // Identify eligible task IDs based on selected filters
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

  // Populate table rows, sampling if the total exceeds MAX_NUM_ROWS
  const rows = useMemo(() => {
    const tableRows = populateTableRows(tasks, results, eligibleTaskIDs);
    return tableRows.length > MAX_NUM_ROWS
      ? sampleSize(tableRows, MAX_NUM_ROWS)
      : tableRows;
  }, [tasks, results, eligibleTaskIDs]);

  const showWarning = rows.length === MAX_NUM_ROWS;

  // Adjust headers based on selected models and show-targets toggle
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

  useEffect(() => {
    setVisibleRows(
      rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    );
  }, [rows, page, pageSize]);

  return (
    <>
      {headers && rows && (
        <div className={classes.page}>
          <div className={classes.selectors}>
            <div className={classes.modelSelector}>
              <FilterableMultiSelect
                id={'predictions-model-selector'}
                titleText="Choose models"
                items={models}
                selectedItems={selectedModels}
                itemToString={(item) => (item ? item.name : '')}
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
                          {headers.map((header, index) => {
                            const { key: _key, ...headerProps } =
                              getHeaderProps({ header });
                            return (
                              <TableHeader
                                key={'header--' + index}
                                {...headerProps}
                              >
                                {header.header}
                              </TableHeader>
                            );
                          })}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((row, index) => {
                          const { key: _key, ...rowProps } = getRowProps({
                            row,
                          });
                          return (
                            <TableRow key={'row--' + index} {...rowProps}>
                              {row.cells.map((cell) => (
                                <TableCell key={cell.id}>
                                  {cell.info.header === 'targets' && cell.value
                                    ? cell.value.length > 1
                                      ? cell.value.map(
                                          (targetText, targetIdx) => (
                                            <span key={targetIdx}>
                                              Target {targetIdx + 1}
                                              :&nbsp;
                                              {parse(
                                                DOMPurify.sanitize(targetText),
                                              )}
                                              <div
                                                className={
                                                  classes.targetSeparator
                                                }
                                              />
                                            </span>
                                          ),
                                        )
                                      : parse(DOMPurify.sanitize(cell.value[0]))
                                    : parse(DOMPurify.sanitize(cell.value))}
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        })}
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
                  setPageSize(event.pageSize);
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
