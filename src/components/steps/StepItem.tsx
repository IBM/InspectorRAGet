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
import { CodeSnippet } from '@carbon/react';
import {
  Idea,
  Function,
  Code,
  QueryQueue,
  TextAlignJustify,
  ChevronRight,
  ChevronDown,
} from '@carbon/icons-react';

import { Step } from '@/src/types';

import classes from './StepItem.module.scss';

// --- Types ---

interface Props {
  step: Step;
  onMouseDown?: () => void;
}

// --- Helpers ---

const typeLabel: Record<Step['type'], string> = {
  thinking: 'Thinking',
  tool_call: 'Tool Call',
  tool_response: 'Tool Response',
  retrieval: 'Retrieval',
  generation: 'Generation',
};

const typeColorClass: Record<Step['type'], string> = {
  thinking: classes.tagThinking,
  tool_call: classes.tagToolCall,
  tool_response: classes.tagToolResponse,
  retrieval: classes.tagRetrieval,
  generation: classes.tagGeneration,
};

function StepIcon({ type }: { type: Step['type'] }) {
  switch (type) {
    case 'thinking':
      return <Idea size={16} />;
    case 'tool_call':
      return <Function size={16} />;
    case 'tool_response':
      return <Code size={16} />;
    case 'retrieval':
      return <QueryQueue size={16} />;
    case 'generation':
      return <TextAlignJustify size={16} />;
  }
}

function hasContent(step: Step): boolean {
  if (step.type === 'thinking') return !!step.content;
  if (step.type === 'tool_call') return true;
  if (step.type === 'tool_response') return !!step.content;
  if (step.type === 'generation') return !!step.content;
  if (step.type === 'retrieval') return step.documents.length > 0;
  return false;
}

// --- Main component ---

export default function StepItem({ step, onMouseDown }: Props) {
  const [expanded, setExpanded] = useState(false);

  const duration =
    step.startTimestamp !== undefined && step.endTimestamp !== undefined
      ? step.endTimestamp - step.startTimestamp
      : null;

  const expandable = hasContent(step);

  return (
    <div className={classes.stepItem} onMouseDown={onMouseDown}>
      <button
        className={classes.stepHeader}
        onClick={() => expandable && setExpanded((v) => !v)}
        aria-expanded={expandable ? expanded : undefined}
        disabled={!expandable}
      >
        <span className={`${classes.typeTag} ${typeColorClass[step.type]}`}>
          <StepIcon type={step.type} />
          {typeLabel[step.type]}
        </span>

        {step.type === 'tool_call' && (
          <span className={classes.stepName}>{step.name}</span>
        )}
        {step.type === 'tool_response' && (
          <span className={classes.stepName}>
            <ChevronRight size={14} />
            {step.toolCallId}
          </span>
        )}

        {duration !== null && (
          <span className={classes.stepDuration}>{duration} ms</span>
        )}

        {expandable && (
          <span className={classes.expandIcon}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        )}
      </button>

      {expanded && (
        <div className={classes.stepContent}>
          {step.type === 'thinking' && <p>{step.content}</p>}

          {step.type === 'tool_call' && (
            <CodeSnippet type="multi" hideCopyButton wrapText>
              {JSON.stringify(step.arguments, null, 2)}
            </CodeSnippet>
          )}

          {step.type === 'tool_response' && (
            <p>
              {typeof step.content === 'string'
                ? step.content
                : JSON.stringify(step.content, null, 2)}
            </p>
          )}

          {step.type === 'generation' && <p>{step.content}</p>}

          {step.type === 'retrieval' && step.documents.length > 0 && (
            <ul className={classes.documentList}>
              {step.documents.map((doc, i) => (
                <li key={i}>{doc.documentId}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
