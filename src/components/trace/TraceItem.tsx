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
import {
  Bot,
  Tools,
  InformationFilled,
  ChevronRight,
  ChevronDown,
} from '@carbon/icons-react';

import { TraceEvent } from '@/src/types';
import {
  ToolCallCard,
  ToolResponseCard,
} from '@/src/components/tools/ToolCards';

import classes from './TraceItem.module.scss';

// --- Types ---

interface Props {
  event: TraceEvent;
}

// --- Helpers ---

const typeLabel: Record<TraceEvent['type'], string> = {
  invocation: 'Invocation',
  tool_execution: 'Tool Execution',
  observation: 'Observation',
};

const typeColorClass: Record<TraceEvent['type'], string> = {
  invocation: classes.tagInvocation,
  tool_execution: classes.tagToolExecution,
  observation: classes.tagObservation,
};

function TraceIcon({ type }: { type: TraceEvent['type'] }) {
  switch (type) {
    case 'invocation':
      return <Bot size={16} />;
    case 'tool_execution':
      return <Tools size={16} />;
    case 'observation':
      return <InformationFilled size={16} />;
  }
}

function hasContent(event: TraceEvent): boolean {
  if (event.type === 'invocation') {
    return !!(
      event.thinking ||
      event.output?.content ||
      event.output?.tool_calls?.length
    );
  }
  if (event.type === 'tool_execution') {
    return !!event.result?.content;
  }
  if (event.type === 'observation') {
    return !!event.content;
  }
  return false;
}

// Render the content of an invocation's output message.
function InvocationContent({
  event,
}: {
  event: Extract<TraceEvent, { type: 'invocation' }>;
}) {
  return (
    <div className={classes.invocationContent}>
      {event.thinking && (
        <div className={classes.thinkingSection}>
          <div className={classes.thinkingLabel}>Thinking</div>
          <p>{event.thinking}</p>
        </div>
      )}
      {event.output?.tool_calls && event.output.tool_calls.length > 0 && (
        <div className={classes.toolCallList}>
          {event.output.tool_calls.map((call) => (
            <ToolCallCard key={call.id} call={call} defaultExpanded />
          ))}
        </div>
      )}
      {event.output?.content && typeof event.output.content === 'string' && (
        <p>{event.output.content}</p>
      )}
    </div>
  );
}

// --- Main component ---

export default function TraceItem({ event }: Props) {
  const [expanded, setExpanded] = useState(false);

  const expandable = hasContent(event);

  // Show agent name for invocations, tool_call_id for tool_execution; nothing for observation.
  const subtitle =
    event.type === 'invocation'
      ? event.agent
      : event.type === 'tool_execution' &&
          typeof (event.result as any)?.tool_call_id === 'string'
        ? (event.result as any).tool_call_id
        : undefined;

  const label = event.label;

  return (
    <div className={classes.traceItem}>
      <button
        className={classes.traceHeader}
        onClick={() => expandable && setExpanded((v) => !v)}
        aria-expanded={expandable ? expanded : undefined}
        disabled={!expandable}
      >
        <span className={`${classes.typeTag} ${typeColorClass[event.type]}`}>
          <TraceIcon type={event.type} />
          {typeLabel[event.type]}
        </span>

        {subtitle && (
          <span className={classes.traceName}>
            <ChevronRight size={14} />
            {subtitle}
          </span>
        )}

        {label && <span className={classes.traceLabel}>{label}</span>}

        {expandable && (
          <span className={classes.expandIcon}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        )}
      </button>

      {expanded && (
        <div className={classes.traceContent}>
          {event.type === 'invocation' && <InvocationContent event={event} />}

          {event.type === 'tool_execution' && (
            <ToolResponseCard
              toolCallId={(event.result as any).tool_call_id}
              content={
                typeof event.result.content === 'string'
                  ? event.result.content
                  : JSON.stringify(event.result.content, null, 2)
              }
              defaultExpanded
            />
          )}

          {event.type === 'observation' && <p>{event.content}</p>}
        </div>
      )}
    </div>
  );
}
