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

import { useState, useEffect, useMemo } from 'react';
import { isEmpty } from 'lodash';
import {
  DataTable,
  TableContainer,
  Table,
  TableToolbar,
  TableBatchActions,
  TableBatchAction,
  TableToolbarContent,
  TableToolbarSearch,
  TableHead,
  TableRow,
  TableSelectAll,
  TableSelectRow,
  TableHeader,
  TableBody,
  TableCell,
  Pagination,
  Button,
  Tooltip,
} from '@carbon/react';
import { Flag, FlagFilled, DocumentExport, Chat } from '@carbon/icons-react';
import { SimpleBarChart } from '@carbon/charts-react';
import { ScaleTypes } from '@carbon/charts';

import { useTheme } from '@/src/theme';
import { Metric, Model, Task, TaskEvaluation } from '@/src/types';
import { extractMetricDisplayValue } from '@/src/utilities/metrics';
import { truncate } from '@/src/utilities/strings';
import { useDataStore } from '@/src/store';
import { useNotification } from '@/src/components/notification/Notification';
import { exportData } from '@/src/processor';

import classes from './TasksTable.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
type EvaluationRow = {
  id: string;
  taskId: string;
};
interface Props {
  metrics: Metric[];
  evaluations: TaskEvaluation[];
  models: Model[];
  filters: { [key: string]: string[] };
  annotator?: string;
  onClick: Function;
}

// ===================================================================================
//                               COMPUTE FUNCTIONS
// ===================================================================================
/**
 * Helper function to compute evaluation table headers and rows
 * @param evaluations full set of evaluations
 * @param metric metric under consideration
 * @returns
 */
function populateTable(
  evaluations: TaskEvaluation[],
  metrics: Metric[],
  models: Model[],
  taskInputMap: { [key: string]: any },
  filters: { [key: string]: string[] },
  annotator?: string,
): [{ key: string; header: string }[], EvaluationRow[]] {
  const modelIds = new Set<string>();
  const applicableFilters = new Set<string>();
  const headers = [
    {
      key: 'task',
      header: 'Task',
    },
  ];
  const rows: EvaluationRow[] = [];

  // Step 1: Build evaluations map combining different model evaluations
  const evaluationsMap = new Map<string, any>();
  evaluations.forEach((evaluation) => {
    const entry = evaluationsMap.get(evaluation.taskId) || {};

    // Step 1.a: Add filter value, if exists in evaluation and not already added
    if (isEmpty(entry) && !isEmpty(filters)) {
      for (const filter of Object.keys(filters)) {
        if (evaluation.hasOwnProperty(filter)) {
          entry[filter] = evaluation[filter];

          // Add to list of applicable filters
          applicableFilters.add(filter);
        }
      }
    }

    // Add annotations
    entry[`${evaluation.modelId}::value`] = {};
    metrics.forEach((metric) => {
      if (annotator) {
        entry[`${evaluation.modelId}::value`][metric.name] =
          extractMetricDisplayValue(
            evaluation[metric.name][annotator].value,
            metric.values,
          );
      } else {
        entry[`${evaluation.modelId}::value`][metric.name] =
          extractMetricDisplayValue(
            evaluation[`${metric.name}_agg`].value,
            metric.values,
          );
      }
    });

    // Step 1.b: Save updated entry into evaluations map
    evaluationsMap.set(evaluation.taskId, entry);

    // Step 1.c: Add model id to set of model ids
    modelIds.add(evaluation.modelId);
  });

  // Step 2: Update evaluation table header based on filters
  applicableFilters.forEach((filter) => {
    const header = filter.split('_').join(' ');
    headers.push({
      key: filter,
      header: header.charAt(0).toUpperCase() + header.slice(1).toLowerCase(),
    });
  });

  // Step 3: Update evaluation table headers based on model ids
  modelIds.forEach((modelId) => {
    headers.push({
      key: `${modelId}::value`,
      header:
        models.find((model) => model.modelId === modelId)?.name || modelId,
    });
  });

  // Step 4: Populate evaluation table rows
  evaluationsMap.forEach((record, taskId) => {
    rows.push({ id: taskId, task: taskInputMap[taskId] || taskId, ...record });
  });

  // Step 3: Populate evaluation table rows
  return [headers, rows];
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
/**
 * Build sparkline graph
 */
function sparkline(
  annotations: {
    [key: string]: { timestamp: number; value: string };
  },
  metric: Metric,
  theme?: string,
) {
  if (annotations) {
    // Initialize distribution with potential values for x-axis
    const distribution: { [key: string]: number } = metric.values
      ? Object.fromEntries(
          metric.values.map((entry) => [entry.displayValue, 0]),
        )
      : {};

    // Iterate over annotations to populate distribution (y-axis)
    for (const [, entries] of Object.entries(annotations)) {
      const displayValue = extractMetricDisplayValue(
        entries.value,
        metric.values,
      );
      if (distribution.hasOwnProperty(displayValue)) {
        distribution[displayValue] += 1;
      } else {
        distribution[displayValue] = 1;
      }
    }

    // Transform distribution into data type suitable for SimpleBarChart
    const data = Object.entries(distribution).map(([value, count]) => {
      return { group: value, value: count };
    });

    // Identify number of unique used values
    const numOfUsedValues = data.filter((entry) => entry.value !== 0).length;

    return (
      <SimpleBarChart
        data={data}
        options={{
          color: {
            scale: Object.fromEntries(
              data.map((entry) => [
                entry.group,
                numOfUsedValues === 1
                  ? '#42be65'
                  : numOfUsedValues >= 3
                    ? '#fa4d56'
                    : '#f1c21b',
              ]),
            ),
          },
          axes: {
            left: {
              mapsTo: 'value',
              visible: false,
              scaleType: ScaleTypes.LINEAR,
            },
            bottom: {
              mapsTo: 'group',
              visible: false,
              scaleType: ScaleTypes.LABELS,
            },
          },
          grid: {
            y: {
              enabled: false,
            },
            x: {
              enabled: false,
            },
          },
          legend: {
            enabled: false,
          },
          toolbar: {
            enabled: false,
          },
          height: '24px',
          width: '48px',
          theme: theme,
        }}
      ></SimpleBarChart>
    );
  }

  return null;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function TasksTable({
  metrics,
  evaluations,
  models,
  filters,
  annotator,
  onClick,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleRows, setVisibleRows] = useState<EvaluationRow[]>([]);

  // Step 2: Run effects
  // Step 2.a: Fetch theme
  const { theme } = useTheme();

  // Step 2.b: Fetch data from data store
  const { item, taskMap, updateTask: updateTask } = useDataStore();

  // Step 2.c: Notification hook
  const { createNotification } = useNotification();

  // Step 2.d: Build evaluations map
  const evaluationsMap = useMemo(() => {
    return Object.fromEntries(
      evaluations.map((evaluation) => [
        `${evaluation.taskId}:${evaluation.modelId}`,
        Object.fromEntries(
          metrics.map((metric) => [metric.name, evaluation[metric.name]]),
        ),
      ]),
    );
  }, [evaluations, metrics]);

  // Step 2.e: Build tasks map
  const taskInputMap = useMemo(() => {
    return Object.fromEntries(
      evaluations.map((evaluation) => [
        `${evaluation.taskId}`,
        evaluation.query,
      ]),
    );
  }, [evaluations]);

  // Step 2.f: Populate table header and rows
  var [headers, rows]: [{ key: string; header: string }[], EvaluationRow[]] =
    useMemo(
      () =>
        populateTable(
          evaluations,
          metrics,
          models,
          taskInputMap,
          filters,
          annotator,
        ),
      [evaluations, metrics, models, filters, taskInputMap, annotator],
    );

  // Step 2.g: Identify visible rows
  useEffect(() => {
    // Set visible rows
    setVisibleRows(() => {
      if (rows.length <= pageSize) {
        setPage(1);
      }
      return rows.slice(
        (page - 1) * pageSize,
        (page - 1) * pageSize + pageSize,
      );
    });
  }, [rows, page, pageSize]);

  // Step 3: Render
  return (
    <>
      {headers && rows && (
        <div>
          <DataTable rows={visibleRows} headers={headers} isSortable>
            {({
              rows,
              headers,
              getHeaderProps,
              getRowProps,
              getToolbarProps,
              getSelectionProps,
              getBatchActionProps,
              selectedRows,
              getTableProps,
              getTableContainerProps,
              onInputChange,
              selectRow,
            }) => {
              const batchActionProps = {
                ...getBatchActionProps({
                  onSelectAll: () => {
                    rows.map((row) => {
                      if (!row.isSelected) {
                        selectRow(row.id);
                      }
                    });
                  },
                }),
              };
              return (
                <TableContainer
                  className={classes.table}
                  {...getTableContainerProps()}
                >
                  <TableToolbar {...getToolbarProps()}>
                    <TableBatchActions {...batchActionProps}>
                      <TableBatchAction
                        tabIndex={
                          batchActionProps.shouldShowBatchActions ? 0 : -1
                        }
                        renderIcon={FlagFilled}
                        onClick={() => {
                          selectedRows.forEach((entry) =>
                            updateTask(entry.id, {
                              flagged: true,
                            }),
                          );
                        }}
                      >
                        Flag
                      </TableBatchAction>
                      <TableBatchAction
                        tabIndex={
                          batchActionProps.shouldShowBatchActions ? 0 : -1
                        }
                        renderIcon={Flag}
                        onClick={() => {
                          selectedRows.forEach((entry) =>
                            updateTask(entry.id, {
                              flagged: false,
                            }),
                          );
                        }}
                      >
                        Unflag
                      </TableBatchAction>
                      <TableBatchAction
                        tabIndex={
                          batchActionProps.shouldShowBatchActions ? 0 : -1
                        }
                        renderIcon={DocumentExport}
                        onClick={() => {
                          const success = exportData(
                            item,
                            selectedRows.map((entry) => taskMap?.get(entry.id)),
                          );

                          if (success) {
                            // Notify user about successfuly export
                            createNotification({
                              kind: 'success',
                              title: 'Export successful.',
                              subtitle:
                                'Please look into browser default save location.',
                            });
                          } else {
                            // Notify user about invalid request
                            createNotification({
                              kind: 'error',
                              title: 'Export unsuccessful.',
                              subtitle: 'Please contact us.',
                            });
                          }
                        }}
                      >
                        Export
                      </TableBatchAction>
                    </TableBatchActions>
                    <TableToolbarContent className={classes.toolbar}>
                      <TableToolbarSearch
                        className={classes.toolbarSearch}
                        onChange={onInputChange}
                      />
                    </TableToolbarContent>
                  </TableToolbar>
                  <Table {...getTableProps()}>
                    <TableHead>
                      <TableRow>
                        <TableSelectAll {...getSelectionProps()} />
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
                          <TableSelectRow
                            {...getSelectionProps({
                              row,
                            })}
                          />
                          {row.cells.map((cell) =>
                            cell.info.header === 'task' ? (
                              <TableCell key={cell.id}>
                                <div className={classes.taskCell}>
                                  <span
                                    className={classes.link}
                                    onClick={() => {
                                      onClick(row.id);
                                    }}
                                  >
                                    {truncate(cell.value, 80)}
                                  </span>
                                  <div className={classes.taskCellDetails}>
                                    {taskMap?.get(cell.id.split(':task')[0])
                                      ?.comments && (
                                      <Tooltip
                                        align={'bottom'}
                                        label={
                                          'Click to view task with comments'
                                        }
                                      >
                                        <Button
                                          id="comments-btn"
                                          className={classes.ViewCommentsBtn}
                                          kind={'ghost'}
                                          onClick={() => {
                                            onClick(row.id);
                                          }}
                                        >
                                          <Chat />
                                          {
                                            taskMap?.get(
                                              cell.id.split(':task')[0],
                                            )?.comments?.length
                                          }
                                        </Button>
                                      </Tooltip>
                                    )}
                                    <Tooltip
                                      align={'bottom-right'}
                                      label={'Click to flag task'}
                                    >
                                      <Button
                                        key={`${cell.value}__flag-btn`}
                                        className={classes.flagTaskBtn}
                                        kind={'ghost'}
                                        onClick={() => {
                                          const taskId =
                                            cell.id.split(':task')[0];

                                          // Step 0: Fetch task to update
                                          const task: Task | undefined =
                                            taskMap?.get(taskId);

                                          // Step 1: Update, if possible
                                          if (task) {
                                            // Step 1.a: Update global copy
                                            updateTask(taskId, {
                                              flagged: !task?.flagged,
                                            });
                                          }
                                        }}
                                      >
                                        {taskMap?.get(cell.id.split(':task')[0])
                                          ?.flagged ? (
                                          <FlagFilled />
                                        ) : (
                                          <Flag />
                                        )}
                                      </Button>
                                    </Tooltip>
                                  </div>
                                </div>
                              </TableCell>
                            ) : (
                              <TableCell key={cell.id}>
                                <div className={classes.tableCell}>
                                  {cell.value ? (
                                    typeof cell.value === 'object' ? (
                                      <>
                                        {metrics.map((metric) => {
                                          return (
                                            <>
                                              <div
                                                className={
                                                  classes.tableCellValue
                                                }
                                                key={`${cell.id}::${metric.name}`}
                                              >
                                                <div
                                                  className={
                                                    classes.majorityValue
                                                  }
                                                >
                                                  {cell.value[metric.name]}
                                                </div>
                                                {!annotator &&
                                                evaluationsMap[
                                                  cell.id.split('::value', 1)[0]
                                                ]
                                                  ? sparkline(
                                                      evaluationsMap[
                                                        cell.id.split(
                                                          '::value',
                                                          1,
                                                        )[0]
                                                      ][metric.name],
                                                      metric,
                                                      theme,
                                                    )
                                                  : null}
                                              </div>
                                            </>
                                          );
                                        })}
                                      </>
                                    ) : (
                                      <div className={classes.majorityValue}>
                                        {Array.isArray(cell.value)
                                          ? cell.value.join(', ')
                                          : cell.value}
                                      </div>
                                    )
                                  ) : (
                                    <div className={classes.majorityValue}>
                                      -
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            ),
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              );
            }}
          </DataTable>
          <Pagination
            pageSizes={[10, 25, 50, 100, 200]}
            totalItems={rows.length}
            onChange={(event: any) => {
              // Step 1: Update page size
              setPageSize(event.pageSize);
              // Step 2: Update page
              setPage(event.page);
            }}
          ></Pagination>
        </div>
      )}
    </>
  );
}
