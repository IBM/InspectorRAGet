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

import { useMemo, useState } from 'react';
import {
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  ContainedList,
  ContainedListItem,
  CodeSnippet,
  Button,
} from '@carbon/react';
import { ChevronDown, ChevronUp } from '@carbon/icons-react';

import {
  Model,
  ModelResult,
  Task,
  Metric,
  TaskTarget,
  ToolCallRecord,
} from '@/src/types';
import { useDataStore } from '@/src/store';
import { truncate } from '@/src/utilities/strings';

import EvaluationsPanel from '@/src/components/evaluations/EvaluationsPanel';
import TraceGroup from '@/src/components/trace/TraceGroup';
import AvailableToolsPanel from '@/src/components/tools/AvailableToolsPanel';
import ChatLine from '@/src/task-types/rag/components/ChatLine';
import AgenticCopier from '@/src/task-types/agentic/Copier';

import classes from './TaskView.module.scss';

// --- Types ---

interface Props {
  task: Task;
  models: Map<string, Model>;
  metrics: Metric[];
  taskCopierModalOpen: boolean;
  setTaskCopierModalOpen: Function;
  updateCommentProvenance: Function;
}

// --- Render helpers ---

// Renders a single TaskTarget by its discriminated type.
function TargetBlock({ target, index }: { target: TaskTarget; index: number }) {
  const label = index > 0 ? `Target ${index + 1}` : undefined;

  if (target.type === 'text') {
    return (
      <div className={classes.targetBlock}>
        {label && <span className={classes.targetLabel}>{label}</span>}
        <p className={classes.targetText}>{target.value}</p>
      </div>
    );
  }

  if (target.type === 'state') {
    return (
      <div className={classes.targetBlock}>
        {label && <span className={classes.targetLabel}>{label}</span>}
        <CodeSnippet type="multi" hideCopyButton wrapText>
          {JSON.stringify(target.value, null, 2)}
        </CodeSnippet>
      </div>
    );
  }

  if (target.type === 'tool_calls') {
    return (
      <div className={classes.targetBlock}>
        {label && <span className={classes.targetLabel}>{label}</span>}
        <div className={classes.callList}>
          {target.calls.map((call: ToolCallRecord) => (
            <div key={call.id} className={classes.callChip}>
              <span className={classes.callName}>{call.name}</span>
              {Object.keys(call.arguments).length > 0 && (
                <CodeSnippet type="multi" hideCopyButton wrapText>
                  {JSON.stringify(call.arguments, null, 2)}
                </CodeSnippet>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

// Turn demarcator: shown before each user message in the execution thread
// to give the multi-turn trace a readable structure.
function TurnDivider({ turn }: { turn: number }) {
  return (
    <div className={classes.turnDivider}>
      <span className={classes.turnLabel}>Turn {turn}</span>
    </div>
  );
}

// --- Main component ---

export default function AgenticTaskView({
  task,
  models,
  metrics,
  taskCopierModalOpen,
  setTaskCopierModalOpen,
  updateCommentProvenance,
}: Props) {
  const { item: data } = useDataStore();

  const results = useMemo(() => {
    if (!data) return undefined;
    return data.results.filter((r) => r.taskId === task.taskId);
  }, [task.taskId, data]);

  const [hMetrics, aMetrics] = useMemo(() => {
    const human = new Map(
      metrics?.filter((m) => m.author === 'human').map((m) => [m.name, m]),
    );
    const algorithmic = new Map(
      metrics?.filter((m) => m.author === 'algorithm').map((m) => [m.name, m]),
    );
    return [human, algorithmic];
  }, [metrics]);

  // Per-model selection state: which assistant message index is selected for Steps.
  // Initialised lazily to the last assistant message index once results are known.
  const [selectedMessageIndex, setSelectedMessageIndex] = useState<
    Record<string, number>
  >({});

  const hasContexts = Array.isArray(task.contexts) && task.contexts.length > 0;
  const hasTargets = Array.isArray(task.targets) && task.targets.length > 0;
  const hasTools = Array.isArray(task.tools) && task.tools.length > 0;

  const [contextsExpanded, setContextsExpanded] = useState(false);
  const [targetsExpanded, setTargetsExpanded] = useState(false);

  // Goal: the last user message in task.input (or the only message).
  const goal = useMemo(() => {
    if (!Array.isArray(task.input) || task.input.length === 0) return null;
    const last = task.input[task.input.length - 1];
    return typeof last.content === 'string' ? last.content : null;
  }, [task.input]);

  return (
    <>
      {models && metrics && task && results && (
        <AgenticCopier
          open={taskCopierModalOpen}
          models={Array.from(models.values())}
          metrics={metrics}
          task={task}
          results={results}
          onClose={() => setTaskCopierModalOpen(false)}
        />
      )}

      {task && models && results && (
        <div className={classes.layout}>
          {/* Left column: goal + initial state + target state */}
          <div className={classes.inputContainer}>
            <ContainedList label="Goal" kind="on-page">
              <ContainedListItem>
                <p className={classes.goalText}>
                  {goal ?? (
                    <span className={classes.notProvided}>Not provided</span>
                  )}
                </p>
              </ContainedListItem>
            </ContainedList>

            {hasContexts && (
              <>
                <hr className={classes.sectionDividerLeft} />
                <ContainedList
                  label="Initial State"
                  kind="on-page"
                  action={
                    <Button
                      kind="ghost"
                      size="sm"
                      hasIconOnly
                      iconDescription={contextsExpanded ? 'Collapse' : 'Expand'}
                      renderIcon={contextsExpanded ? ChevronUp : ChevronDown}
                      tooltipAlignment="end"
                      onClick={() => setContextsExpanded((v) => !v)}
                    />
                  }
                >
                  {contextsExpanded && (
                    <ContainedListItem>
                      {/* Contexts can be env state (JSON) or policy docs (text).
                          CodeSnippet type="multi" handles both. */}
                      <CodeSnippet type="multi" hideCopyButton wrapText>
                        {JSON.stringify(task.contexts, null, 2)}
                      </CodeSnippet>
                    </ContainedListItem>
                  )}
                </ContainedList>
              </>
            )}

            {hasTargets && (
              <>
                <hr className={classes.sectionDividerLeft} />
                <ContainedList
                  label={`Target State${task.targets!.length > 1 ? 's' : ''}`}
                  kind="on-page"
                  action={
                    <Button
                      kind="ghost"
                      size="sm"
                      hasIconOnly
                      iconDescription={targetsExpanded ? 'Collapse' : 'Expand'}
                      renderIcon={targetsExpanded ? ChevronUp : ChevronDown}
                      tooltipAlignment="end"
                      onClick={() => setTargetsExpanded((v) => !v)}
                    />
                  }
                >
                  {targetsExpanded && (
                    <ContainedListItem>
                      <div
                        className={classes.targetsContent}
                        onMouseDown={() => updateCommentProvenance('target')}
                        onMouseUp={() => updateCommentProvenance('target')}
                      >
                        {task.targets!.map((target, idx) => (
                          <TargetBlock
                            key={`target--${idx}`}
                            target={target}
                            index={idx}
                          />
                        ))}
                      </div>
                    </ContainedListItem>
                  )}
                </ContainedList>
              </>
            )}

            {hasTools && (
              <>
                <hr className={classes.sectionDividerLeft} />
                <ContainedList label="Available Tools" kind="on-page">
                  <ContainedListItem>
                    <AvailableToolsPanel tools={task.tools!} />
                  </ContainedListItem>
                </ContainedList>
              </>
            )}
          </div>

          <div className={classes.separator} />

          {/* Right column: per-model execution thread + eval/steps tabs */}
          <div className={classes.modelsContainer}>
            <Tabs>
              <TabList aria-label="Models" contained fullWidth>
                {results.map((result) => (
                  <Tab key={`agentic-model-${result.modelId}`}>
                    {truncate(
                      models.get(result.modelId)?.name || result.modelId,
                      15,
                    )}
                  </Tab>
                ))}
              </TabList>
              <TabPanels>
                {results.map((result) => {
                  const thread = result.output;

                  // Find all assistant messages so we can track which one the
                  // researcher has selected for the Steps tab.
                  const assistantIndices = thread
                    .map((msg, i) => (msg.role === 'assistant' ? i : -1))
                    .filter((i) => i >= 0);

                  const defaultSelected =
                    assistantIndices[assistantIndices.length - 1] ?? 0;
                  const selected =
                    selectedMessageIndex[result.modelId] ?? defaultSelected;

                  const selectedMsg = thread[selected];
                  const trace = selectedMsg?.trace;
                  const hasTrace = Array.isArray(trace) && trace.length > 0;

                  // Track which turn we are on — incremented on each user message.
                  let turnCounter = 0;

                  return (
                    <TabPanel key={`agentic-model-${result.modelId}-panel`}>
                      <div className={classes.tabContainer}>
                        {/* Execution thread */}
                        <ContainedList label="Execution Thread" kind="on-page">
                          <ContainedListItem>
                            <div className={classes.threadContent}>
                              {thread.map((message, idx) => {
                                if (message.role === 'user') turnCounter += 1;
                                const isAssistant =
                                  message.role === 'assistant';
                                const isSelected = idx === selected;

                                return (
                                  <div key={`thread-${idx}`}>
                                    {message.role === 'user' && (
                                      <TurnDivider turn={turnCounter} />
                                    )}
                                    <div
                                      className={
                                        isAssistant
                                          ? classes.messageWrapperClickable
                                          : undefined
                                      }
                                      onClick={
                                        isAssistant
                                          ? () =>
                                              setSelectedMessageIndex(
                                                (prev) => ({
                                                  ...prev,
                                                  [result.modelId]: idx,
                                                }),
                                              )
                                          : undefined
                                      }
                                      role={isAssistant ? 'button' : undefined}
                                      aria-pressed={
                                        isAssistant ? isSelected : undefined
                                      }
                                    >
                                      <ChatLine
                                        messageId={`agentic-${result.modelId}--${idx}`}
                                        message={message}
                                        onSelection={updateCommentProvenance}
                                        latestResponse={
                                          idx === thread.length - 1
                                        }
                                        focused={isAssistant && isSelected}
                                        selected={isAssistant && isSelected}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </ContainedListItem>
                        </ContainedList>

                        <hr className={classes.sectionDivider} />

                        {/* Evaluations + Steps tabs */}
                        <Tabs>
                          <TabList
                            aria-label="Result details"
                            contained
                            fullWidth
                          >
                            <Tab>Evaluations</Tab>
                            {/* Trace tab shows trace for the selected assistant message */}
                            <Tab disabled={!hasTrace}>
                              Trace
                              {hasTrace && assistantIndices.length > 1 && (
                                <span className={classes.stepsTabHint}>
                                  {' '}
                                  (Turn {assistantIndices.indexOf(selected) + 1}
                                  )
                                </span>
                              )}
                            </Tab>
                          </TabList>
                          <TabPanels>
                            <TabPanel className={classes.flushTabPanel}>
                              <EvaluationsPanel
                                scores={result.scores}
                                hMetrics={hMetrics}
                                aMetrics={aMetrics}
                                onCellMouseDown={(metricName, annotator) =>
                                  updateCommentProvenance(
                                    `${result.modelId}::evaluation::scores::${metricName}::${annotator}`,
                                  )
                                }
                              />
                            </TabPanel>

                            <TabPanel className={classes.flushTabPanel}>
                              {hasTrace && (
                                <>
                                  {assistantIndices.length > 1 && (
                                    <p className={classes.stepsHint}>
                                      Showing trace for the selected assistant
                                      message. Click any assistant message in
                                      the thread to switch.
                                    </p>
                                  )}
                                  <TraceGroup trace={trace!} />
                                </>
                              )}
                            </TabPanel>
                          </TabPanels>
                        </Tabs>
                      </div>
                    </TabPanel>
                  );
                })}
              </TabPanels>
            </Tabs>
          </div>
        </div>
      )}
    </>
  );
}
