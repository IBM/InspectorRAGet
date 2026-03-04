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

// --- Compute functions ---

/** Build table headers and rows from per-metric annotation bags, keyed by annotator. */
function populateTable(
  annotations: {
    [key: string]: { [key: string]: Annotation };
  },
  metrics: Metric[],
) {
  const metricNames = metrics.map((metric) => metric.name);
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

  const metricsPerAnnotator: {
    [key: string]: { [key: string]: string | number };
  } = {};
  for (const [metricName, annotators] of Object.entries(annotations)) {
    if (metricNames.includes(metricName)) {
      for (const [annotator, entry] of Object.entries(annotators)) {
        if (metricsPerAnnotator.hasOwnProperty(annotator)) {
          metricsPerAnnotator[annotator][metricName] = entry.value;
        } else {
          metricsPerAnnotator[annotator] = { [metricName]: entry.value };
        }
      }
    }
  }

  const rows: { [key: string]: any }[] = [];
  for (const [annotator, metricNames] of Object.entries(metricsPerAnnotator)) {
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

// --- Main component ---

export default function AnnotationsTable({
  annotations,
  metrics,
}: {
  annotations: {
    [key: string]: { [key: string]: Annotation };
  };
  metrics: Metric[];
}) {
  const [headers, rows] = useMemo(
    () => populateTable(annotations, metrics),
    [annotations, metrics],
  );

  if (!headers || !rows) {
    return null;
  }

  return (
    <DataTable rows={rows} headers={headers}>
      {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
        <TableContainer className={classes.table}>
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((header, index) => {
                  const { key: _key, ...headerProps } = getHeaderProps({
                    header,
                  });
                  return (
                    <TableHeader key={'header--' + index} {...headerProps}>
                      {header.header}
                    </TableHeader>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, index) => {
                const { key: _key, ...rowProps } = getRowProps({ row });
                return (
                  <TableRow key={'row--' + index} {...rowProps}>
                    {row.cells.map((cell) => (
                      <TableCell key={cell.id}>{cell.value}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </DataTable>
  );
}
