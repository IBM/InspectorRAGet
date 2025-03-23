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

import cx from 'classnames';
import Balancer from 'react-wrap-balancer';
import { useState, useEffect, useRef } from 'react';

import { CodeSnippet } from '@carbon/react';

import { Message, ToolCall, ToolMessage, AssistantMessage } from '@/src/types';
import Avatar from '@/src/components/avatar/Avatar';
import DocumentsViewer from '@/src/components/documents-viewer/DocumentsViewer';

import classes from './ChatLine.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface ChatLineProps {
  messageId: string;
  message: Message;
  latestResponse?: boolean;
  onSelection?: Function;
  focused?: boolean;
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================
function Tool({ tool }: { tool: ToolCall }) {
  return (
    <div className={cx(classes.message, classes.toolCall)}>
      <span>
        Tool ID: {tool.id}&nbsp;
        {tool.function.name ? <span>({tool.function.name})</span> : null}
      </span>
      {tool.function.arguments ? (
        <CodeSnippet type="multi" hideCopyButton wrapText>
          {JSON.stringify(tool.function.arguments, null, 2)}
        </CodeSnippet>
      ) : null}
    </div>
  );
}

function ToolResponse({
  messageId,
  message,
  onSelection,
}: {
  messageId: string;
  message: ToolMessage;
  onSelection?: Function;
}) {
  // Step 1: Initialize state and necessary variables
  const [documentIndex, setDocumentIndex] = useState<number>(0);

  // Step 2: Render
  return (
    <div className={cx(classes.message, classes.toolResponse)}>
      <span>
        Tool Call ID: {message.tool_call_id}&nbsp;
        {message.name ? <span>({message.name})</span> : null}
      </span>
      {message.type === 'documents' && Array.isArray(message.content) ? (
        <DocumentsViewer
          key={`${messageId}__documents--${message.content.length}`}
          id={`${messageId}__documents`}
          documents={message.content}
          documentIndex={documentIndex}
          setDocumentIndex={setDocumentIndex}
          onSelection={onSelection}
        ></DocumentsViewer>
      ) : message.type === 'json' ? (
        <CodeSnippet type="multi" hideCopyButton wrapText>
          {JSON.stringify(message.content, null, 2)}
        </CodeSnippet>
      ) : (
        <Balancer
          className={cx(classes.message, classes.toolMessage)}
          ratio={0.2}
          onMouseDown={() => {
            if (onSelection) {
              onSelection(
                `messages[${messageId.split('--').slice(-1)[0]}].content`,
              );
            }
          }}
          onMouseUp={() => {
            if (onSelection) {
              onSelection(
                `messages[${messageId.split('--').slice(-1)[0]}].content`,
              );
            }
          }}
        >
          {typeof message.content === 'string'
            ? message.content.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))
            : message.content}
        </Balancer>
      )}
    </div>
  );
}

function AssistantResponse({
  messageId,
  message,
  onSelection,
}: {
  messageId: string;
  message: AssistantMessage;
  onSelection?: Function;
}) {
  return (
    <div className={classes.assistantResponse}>
      {message.content ? (
        <Balancer
          className={cx(classes.message, classes.assistantMessage)}
          ratio={0.2}
          onMouseDown={() => {
            if (onSelection) {
              onSelection(
                `messages[${messageId.split('--').slice(-1)[0]}].content`,
              );
            }
          }}
          onMouseUp={() => {
            if (onSelection) {
              onSelection(
                `messages[${messageId.split('--').slice(-1)[0]}].content`,
              );
            }
          }}
        >
          {message.content.split('\n').map((line, i) => (
            <span key={i}>
              {line}
              <br />
            </span>
          ))}
        </Balancer>
      ) : null}
      {message.tool_calls
        ? message.tool_calls.map((tool, toolIdx) => {
            return (
              <Tool key={`message-${messageId}__tool-${toolIdx}`} tool={tool} />
            );
          })
        : null}
    </div>
  );
}

// ===================================================================================
//                               MAIN FUNCTIONS
// ===================================================================================
export default function ChatLine({
  messageId,
  message,
  latestResponse,
  onSelection,
  focused,
}: ChatLineProps) {
  // Step 1: Initialize state and necessary variables
  const anchorRef = useRef<HTMLDivElement>(null);

  // Step 2: Run effects
  // Step 2.a: Scroll into view
  useEffect(() => {
    if (anchorRef.current && focused) {
      anchorRef.current.scrollIntoView({
        behavior: 'smooth',
        block: message.role === 'user' ? 'start' : 'center',
        inline: 'center',
      });
    }
  }, [focused, message.role]);

  // Step 3: Render
  // Step 3.a: Return "null" if message is undefined
  if (!message) {
    return null;
  }

  // Step 3.b: Render chat line
  return (
    <div
      ref={anchorRef}
      className={cx(classes.line, {
        [classes.assistantLine]: message.role === 'assistant',
        [classes.latestResponse]: latestResponse,
      })}
    >
      <Avatar role={message.role} />
      <div
        className={cx(
          classes.baloon,
          message.role === 'assistant'
            ? //@ts-ignore
              message.tool_calls
              ? classes.toolCallBaloon
              : classes.assistantBaloon
            : message.role === 'tool'
              ? classes.toolResponseBaloon
              : null,
        )}
      >
        {message.role === 'system' ||
        message.role === 'developer' ||
        message.role === 'user' ? (
          <Balancer
            className={cx(classes.message)}
            ratio={0.2}
            onMouseDown={() => {
              if (onSelection) {
                onSelection(
                  `messages[${messageId.split('--').slice(-1)[0]}].text`,
                );
              }
            }}
            onMouseUp={() => {
              if (onSelection) {
                onSelection(
                  `messages[${messageId.split('--').slice(-1)[0]}].text`,
                );
              }
            }}
          >
            {message.content.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                <br />
              </span>
            ))}
          </Balancer>
        ) : message.role === 'tool' ? (
          //@ts-ignore
          <ToolResponse messageId={messageId} message={message} />
        ) : (
          <AssistantResponse
            messageId={messageId}
            //@ts-ignore
            message={message}
            onSelection={onSelection}
          />
        )}
      </div>
    </div>
  );
}
