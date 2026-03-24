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

import { useState } from 'react';

import { TraceEvent } from '@/src/types';
import TraceItem from './TraceItem';

import classes from './TraceGroup.module.scss';

// --- Types ---

interface Props {
  trace: TraceEvent[];
  depth?: number;
}

// --- Main component ---

// Renders a trace array recursively. Each invocation node may carry a nested
// sub-agent trace which is rendered indented below the parent item.
// At depth >= 3 the children are collapsed by default to prevent visual overload;
// the researcher can expand them with a single click.
export default function TraceGroup({ trace, depth = 0 }: Props) {
  return (
    <div className={classes.spine}>
      {trace.map((event, idx) => {
        const isLast = idx === trace.length - 1;
        const hasChildren =
          event.type === 'invocation' &&
          Array.isArray(event.trace) &&
          event.trace.length > 0;

        return (
          <div
            key={idx}
            className={`${classes.rootNode} ${isLast ? classes.rootNodeLast : ''}`}
          >
            <TraceItem event={event} />
            {hasChildren && (
              <TraceChildren
                trace={
                  (event as Extract<TraceEvent, { type: 'invocation' }>).trace!
                }
                depth={depth}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Helpers ---

// Renders children of an invocation node. At depth >= 3 the children start collapsed.
function TraceChildren({
  trace,
  depth,
}: {
  trace: TraceEvent[];
  depth: number;
}) {
  // Collapse by default when already deep in the hierarchy.
  const [expanded, setExpanded] = useState(depth < 3);

  if (!expanded) {
    return (
      <div className={classes.children}>
        <div className={classes.childNode}>
          <button
            className={classes.collapsedNode}
            onClick={() => setExpanded(true)}
          >
            {trace.length} nested event{trace.length !== 1 ? 's' : ''} — click
            to expand
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.children}>
      {trace.map((child, childIdx) => {
        const isLast = childIdx === trace.length - 1;
        const hasGrandchildren =
          child.type === 'invocation' &&
          Array.isArray(child.trace) &&
          child.trace.length > 0;

        return (
          <div
            key={childIdx}
            className={`${classes.childNode} ${isLast ? classes.childNodeLast : ''}`}
          >
            <TraceItem event={child} />
            {hasGrandchildren && (
              <TraceChildren
                trace={
                  (child as Extract<TraceEvent, { type: 'invocation' }>).trace!
                }
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
