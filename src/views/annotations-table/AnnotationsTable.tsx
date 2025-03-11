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

import { useMemo } from 'react';
import {
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
} from '@carbon/react';

import { Metric, Annotation } from '@/src/types';
import {
  extractMetricDisplayValue,
  extractMetricDisplayName,
} from '@/src/utilities/metrics';

import classes from './AnnotationsTable.module.scss';

// ===================================================================================
//                               COMPUTE FUNCTIONS
// ===================================================================================
/**
 * Helper function to compute annotations table headers and rows
 * @param annotations full set of annotations
 * @returns
 */
function populateTable(
  annotations: {
    [key: string]: { [key: string]: Annotation };
  },
  metrics: Metric[],
) {
  // Step 0: Metric names
  const metricNames = metrics.map((metric) => metric.name);

  // Step 1: Identify headers
  const headers: { key: string; header: string }[] = [
    {
      key: 'annotator',
      header: 'Annotator',
    },
  ];

  metrics.forEach((metric) => {
    headers.push({
      key: metric.name,
      header: extractMetricDisplayName(metric),
    });
  });

  // Step 2: Build rows
  // Step 2.a: Collect metrics per annotator
  const MetricsPerAnnotator: {
    [key: string]: { [key: string]: string | number };
  } = {};
  for (const [metricName, annotators] of Object.entries(annotations)) {
    if (metricNames.includes(metricName)) {
      for (const [annotator, entry] of Object.entries(annotators)) {
        if (MetricsPerAnnotator.hasOwnProperty(annotator)) {
          MetricsPerAnnotator[annotator][metricName] = entry.value;
        } else {
          MetricsPerAnnotator[annotator] = { [metricName]: entry.value };
        }
      }
    }
  }

  // Step 2.a: Formulate rows
  const rows: { [key: string]: any }[] = [];
  for (const [annotator, metricNames] of Object.entries(MetricsPerAnnotator)) {
    const row = { id: annotator, annotator: annotator };
    for (const [metricName, value] of Object.entries(metricNames)) {
      row[metricName] = extractMetricDisplayValue(
        value,
        metrics.find((metric) => metric.name === metricName)?.values,
      );
    }
    rows.push(row);
  }

  return [headers, rows];
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function AnnotationsTable({
  annotations,
  metrics,
}: {
  annotations: {
    [key: string]: { [key: string]: Annotation };
  };
  metrics: Metric[];
}) {
  // Step 1: Run effects
  // Step 1.a: Populate table header and rows
  const [headers, rows] = useMemo(
    () => populateTable(annotations, metrics),
    [annotations, metrics],
  );

  return (
    <>
      {headers && rows && (
        <div>
          <DataTable rows={rows} headers={headers}>
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
                      <TableRow key={'row--' + index} {...getRowProps({ row })}>
                        {row.cells.map((cell) => (
                          <TableCell key={cell.id}>{cell.value}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        </div>
      )}
    </>
  );
}
