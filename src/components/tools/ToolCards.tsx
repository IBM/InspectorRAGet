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

import { isEmpty } from 'lodash';
import { useState } from 'react';
import { CodeSnippet, Tag } from '@carbon/react';
import { ChevronDown, ChevronUp, Function, Tools } from '@carbon/icons-react';

import { ToolCallRecord } from '@/src/types';

import classes from './ToolCards.module.scss';

// --- ToolCallCard ---
// Renders a single function call: icon + name + optional args (expandable).
// Used in tool_calling TaskView (predictions/targets) and ChatLine (assistant messages).

export function ToolCallCard({
  call,
  defaultExpanded = true,
}: {
  call: ToolCallRecord;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasArgs = !isEmpty(call.arguments);

  return (
    <div className={classes.card}>
      <div
        className={`${classes.cardHeader} ${hasArgs ? classes.cardHeaderClickable : ''}`}
        onClick={hasArgs ? () => setExpanded((prev) => !prev) : undefined}
        role={hasArgs ? 'button' : undefined}
        aria-expanded={hasArgs ? expanded : undefined}
      >
        <Function size={16} />
        <span className={classes.cardName}>{call.name}</span>
        {call.id && (
          <Tag type="cool-gray" size="sm">
            {call.id}
          </Tag>
        )}
        {hasArgs && (
          <span className={classes.expandToggle} aria-hidden>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </div>
      {call.dependsOn && (
        <span className={classes.cardMeta}>depends on: {call.dependsOn}</span>
      )}
      {hasArgs && expanded && (
        <div className={classes.expandedBlock}>
          <CodeSnippet type="multi" hideCopyButton wrapText>
            {JSON.stringify(call.arguments, null, 2)}
          </CodeSnippet>
        </div>
      )}
    </div>
  );
}

// --- ToolResponseCard ---
// Renders an environment/tool response: icon + label + content (expandable).
// Used in ChatLine (tool messages in agentic/RAG threads).

interface ToolResponseCardProps {
  toolCallId?: string;
  name?: string;
  content: string;
  defaultExpanded?: boolean;
}

export function ToolResponseCard({
  toolCallId,
  name,
  content,
  defaultExpanded,
}: ToolResponseCardProps) {
  // Default: expanded when short, collapsed when long
  const [expanded, setExpanded] = useState(
    defaultExpanded ?? content.length <= 120,
  );
  const label = name || (toolCallId ? `Response (${toolCallId})` : 'Response');

  return (
    <div className={classes.card}>
      <div
        className={`${classes.cardHeader} ${classes.cardHeaderClickable}`}
        onClick={() => setExpanded((prev) => !prev)}
        role="button"
        aria-expanded={expanded}
      >
        <Tools size={16} />
        <span className={classes.cardName}>{label}</span>
        <span className={classes.expandToggle} aria-hidden>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </div>
      {expanded && (
        <div className={classes.expandedBlock}>
          <CodeSnippet type="multi" hideCopyButton wrapText>
            {content}
          </CodeSnippet>
        </div>
      )}
    </div>
  );
}
