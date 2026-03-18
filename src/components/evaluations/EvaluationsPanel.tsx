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

import { ContainedList } from '@carbon/react';

import { Metric, Annotation } from '@/src/types';
import AnnotationsTable from '@/src/views/annotations-table/AnnotationsTable';

import classes from './EvaluationsPanel.module.scss';

// --- Types ---

interface Props {
  scores: { [key: string]: { [key: string]: Annotation } } | undefined;
  hMetrics: Map<string, Metric>;
  aMetrics: Map<string, Metric>;
  onCellMouseDown?: (metricName: string, annotator: string) => void;
}

// --- Main component ---

export default function EvaluationsPanel({
  scores,
  hMetrics,
  aMetrics,
  onCellMouseDown,
}: Props) {
  if (!scores || (!hMetrics.size && !aMetrics.size)) {
    return <span className={classes.notProvided}>No evaluations</span>;
  }

  return (
    <div className={classes.panels}>
      {hMetrics.size ? (
        <ContainedList label="Human Evaluations" kind="disclosed" size="sm">
          <AnnotationsTable
            annotations={scores}
            metrics={[...hMetrics.values()]}
            onCellMouseDown={onCellMouseDown}
          />
        </ContainedList>
      ) : null}
      {aMetrics.size ? (
        <ContainedList
          label="Algorithmic Evaluations"
          kind="disclosed"
          size="sm"
        >
          <AnnotationsTable
            annotations={scores}
            metrics={[...aMetrics.values()]}
            onCellMouseDown={onCellMouseDown}
          />
        </ContainedList>
      ) : null}
    </div>
  );
}
