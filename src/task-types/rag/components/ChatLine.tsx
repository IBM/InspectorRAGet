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

import cx from 'classnames';
import Balancer from 'react-wrap-balancer';
import { useState, useEffect, useRef } from 'react';
import { Modal, Button, DefinitionTooltip } from '@carbon/react';
import {
  CheckmarkFilled,
  WarningFilled,
  ErrorFilled,
  Restart,
} from '@carbon/icons-react';

import {
  ToolCallCard,
  ToolResponseCard,
} from '@/src/components/tools/ToolCards';
import {
  Message,
  MessageRetry,
  ToolMessage,
  AssistantMessage,
} from '@/src/task-types/rag/types';
import Avatar from '@/src/task-types/rag/components/Avatar';
import DocumentsViewer from '@/src/task-types/rag/components/DocumentsViewer';

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
  selected?: boolean;
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================

const STATUS_CONFIG = {
  pass: {
    icon: CheckmarkFilled,
    label: 'Pass',
    badgeClass: classes.statusBadgePass,
  },
  warn: {
    icon: WarningFilled,
    label: 'Warn',
    badgeClass: classes.statusBadgeWarn,
  },
  fail: {
    icon: ErrorFilled,
    label: 'Fail',
    badgeClass: classes.statusBadgeFail,
  },
} as const;

function RetriesModal({
  retries,
  open,
  onClose,
}: {
  retries: MessageRetry[];
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      modalHeading={`Retry Attempts (${retries.length})`}
      passiveModal
      size="md"
    >
      <div className={classes.retriesModalContent}>
        {retries.map((retry, idx) => (
          <div key={idx} className={classes.retryAttempt}>
            <span className={classes.retryAttemptHeader}>
              Attempt {idx + 1}
            </span>
            {retry.error && (
              <div className={classes.retryError}>
                <span className={classes.retryErrorLabel}>Error</span>
                <span className={classes.retryErrorText}>{retry.error}</span>
              </div>
            )}
            {retry.content && <p>{retry.content}</p>}
            {retry.tool_calls &&
              retry.tool_calls.map((call, callIdx) => (
                <ToolCallCard
                  key={callIdx}
                  call={call}
                  defaultExpanded={
                    retry.tool_calls!.length <= 2 &&
                    JSON.stringify(call.arguments).length <= 120
                  }
                />
              ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function BalloonFooter({
  status,
  statusDefinition,
  retries,
}: {
  status?: string;
  statusDefinition?: string;
  retries?: MessageRetry[];
}) {
  const [retriesOpen, setRetriesOpen] = useState(false);
  const hasStatus = status && status in STATUS_CONFIG;
  const hasRetries = retries && retries.length > 0;

  if (!hasStatus && !hasRetries) return null;

  const config = hasStatus
    ? STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
    : null;

  return (
    <>
      <div className={classes.balloonFooter}>
        <div className={classes.balloonFooterRight}>
          {config &&
            (statusDefinition ? (
              <DefinitionTooltip
                definition={statusDefinition}
                align="top-right"
                openOnHover
                className={cx(classes.statusBadge, config.badgeClass)}
              >
                <config.icon size={14} />
                {config.label}
              </DefinitionTooltip>
            ) : (
              <span className={cx(classes.statusBadge, config.badgeClass)}>
                <config.icon size={14} />
                {config.label}
              </span>
            ))}
          {hasRetries && (
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Restart}
              onClick={() => setRetriesOpen(true)}
            >
              {retries.length} {retries.length === 1 ? 'retry' : 'retries'}
            </Button>
          )}
        </div>
      </div>
      {hasRetries && (
        <RetriesModal
          retries={retries}
          open={retriesOpen}
          onClose={() => setRetriesOpen(false)}
        />
      )}
    </>
  );
}

function ToolResponseContent({
  messageId,
  message,
  onSelection,
}: {
  messageId: string;
  message: ToolMessage;
  onSelection?: Function;
}) {
  const [documentIndex, setDocumentIndex] = useState<number>(0);

  if (message.type === 'documents' && Array.isArray(message.content)) {
    return (
      <div className={classes.toolResponse}>
        <DocumentsViewer
          key={`${messageId}__documents--${message.content.length}`}
          id={`${messageId}__documents`}
          documents={message.content}
          documentIndex={documentIndex}
          setDocumentIndex={setDocumentIndex}
          onSelection={onSelection}
        />
      </div>
    );
  }

  const contentStr =
    message.type === 'json' || typeof message.content !== 'string'
      ? JSON.stringify(message.content, null, 2)
      : (message.content as string);

  return (
    <div className={classes.toolResponse}>
      <ToolResponseCard
        toolCallId={message.tool_call_id}
        name={message.name}
        content={contentStr}
      />
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
            // Collapse if there are more than 2 calls, or if the single call's args are long
            const defaultExpanded =
              message.tool_calls!.length <= 2 &&
              JSON.stringify(tool.arguments).length <= 120;
            return (
              <div
                key={`message-${messageId}__tool-${toolIdx}`}
                className={classes.toolCallItem}
              >
                <ToolCallCard call={tool} defaultExpanded={defaultExpanded} />
              </div>
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
  selected,
}: ChatLineProps) {
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (anchorRef.current && focused) {
      anchorRef.current.scrollIntoView({
        behavior: 'smooth',
        block: message.role === 'user' ? 'start' : 'center',
        inline: 'center',
      });
    }
  }, [focused, message.role]);

  if (!message) {
    return null;
  }

  const status = message.metadata?.status as string | undefined;
  const statusDefinition = message.metadata?.statusDefinition as
    | string
    | undefined;
  const retries = message.retries;

  return (
    <div
      ref={anchorRef}
      className={cx(classes.line, {
        [classes.assistantLine]: message.role === 'assistant',
        [classes.latestResponse]: latestResponse,
      })}
    >
      <Avatar role={message.role} selected={selected} status={status} />
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
          { [classes.baloonSelected]: selected },
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
          <ToolResponseContent
            messageId={messageId}
            // @ts-ignore — message is narrowed to role==='tool' by the condition above,
            // but the base Message type lacks ToolMessage fields (tool_call_id, type).
            message={message}
            onSelection={onSelection}
          />
        ) : (
          <AssistantResponse
            messageId={messageId}
            //@ts-ignore
            message={message}
            onSelection={onSelection}
          />
        )}
        <BalloonFooter
          status={status}
          statusDefinition={statusDefinition}
          retries={retries}
        />
      </div>
    </div>
  );
}
