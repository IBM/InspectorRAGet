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
import { memo, useState, useMemo, useEffect } from 'react';
import {
  Button,
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
import { ArrowLeft, ArrowRight, WarningAlt } from '@carbon/icons-react';

import { RawData } from '@/src/types';
import { DataErrorKinds, processData } from '@/src/processor';

import { useNotification } from '@/src/components/notification/Notification';
import ExperimentTile from '@/src/components/example-tile/ExampleTile';

import classes from './DataVerification.module.scss';

interface Props {
  data: RawData;
  onNext: Function;
  onPrev: Function;
}

interface disqualifiedTaskRow {
  id: string;
  taskId: string;
  models: Set<string>;
  metrics: Set<string>;
  reasons: string[];
}

export default memo(function DataVerificationView({
  data,
  onNext,
  onPrev,
}: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleRows, setVisibleRows] = useState<disqualifiedTaskRow[]>([]);

  const { createNotification } = useNotification();

  // Process and validate data
  const [exampleData, disqualifiedTasks, notifications] = useMemo(
    () => processData(data),
    [data],
  );

  useEffect(() => {
    if (notifications) {
      notifications.forEach((notification) => {
        createNotification(notification);
      });
    }
  }, [notifications]);

  // Create headers, rows and visible rows
  const headers = [
    {
      key: 'taskId',
      header: 'Task ID',
    },
    {
      key: 'models',
      header: 'Missing Models',
    },
    {
      key: 'metrics',
      header: 'Missing Metrics',
    },
    {
      key: 'reasons',
      header: 'Reasons',
    },
  ];

  const rows = useMemo(() => {
    return Object.keys(disqualifiedTasks).map((taskId) => {
      const missingModels = new Set<string>();
      const missingMetrics = new Set<string>();
      const reasons = new Set<string>();

      disqualifiedTasks[taskId].reasons.forEach((reason) => {
        reasons.add(reason.kind);

        if (reason.kind === DataErrorKinds.MISSING_METRIC) {
          missingMetrics.add(reason.data);
        } else if (reason.kind === DataErrorKinds.MISSING_MODEL) {
          missingModels.add(reason.data);
        }
      });

      return {
        id: taskId,
        taskId: taskId,
        models: missingModels,
        metrics: missingMetrics,
        reasons: [...reasons],
      };
    });
  }, [disqualifiedTasks]);

  useEffect(
    () =>
      setVisibleRows(
        rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
      ),
    [rows, page, pageSize],
  );

  return (
    <div className={classes.root}>
      {exampleData ? (
        <>
          <ExperimentTile
            data={exampleData}
            disableNavigation={true}
            disableActions={true}
          ></ExperimentTile>

          {isEmpty(rows) ? (
            <div className={classes.successMessageContainer}>
              <h3>Everything looks good. Enjoy analyzing!</h3>
            </div>
          ) : (
            <>
              <h4>Disqualified Tasks</h4>
              {headers && rows && (
                <div className={classes.disqualifiedTasksContainer}>
                  <DataTable rows={visibleRows} headers={headers}>
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
                                    {cell.info.header != 'taskId'
                                      ? !isEmpty(cell.value)
                                        ? [...cell.value].join(', ')
                                        : '-'
                                      : cell.value}
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
                    pageSizes={[10]}
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
          )}
          {exampleData.tasks.length > 500 ? (
            <div className={classes.warningContainer}>
              <WarningAlt
                height={'32px'}
                width={'32px'}
                className={classes.warningContainerIcon}
              />
              <span className={classes.warningContainerText}>
                {`It might take us a moment to get everything ready once you click the "visualize" button`}
              </span>
            </div>
          ) : null}
          <div className={classes.navigationButtons}>
            <Button
              kind="secondary"
              renderIcon={ArrowLeft}
              iconDescription="Return to uploading data"
              onClick={onPrev}
            >
              Return to uploading data
            </Button>
            <Button
              disabled={!exampleData}
              renderIcon={ArrowRight}
              iconDescription="Proceed"
              onClick={() => {
                onNext(exampleData);
              }}
            >
              Visualize
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
});
