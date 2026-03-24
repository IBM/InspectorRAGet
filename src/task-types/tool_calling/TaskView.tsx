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
} from '@carbon/react';
import { ChevronDown, ChevronUp } from '@carbon/icons-react';

import { Model, ModelResult, Task, Metric, ToolCallRecord } from '@/src/types';
import { useDataStore } from '@/src/store';
import { truncate } from '@/src/utilities/strings';

import EvaluationsPanel from '@/src/components/evaluations/EvaluationsPanel';
import TraceGroup from '@/src/components/trace/TraceGroup';
import AvailableToolsPanel from '@/src/components/tools/AvailableToolsPanel';
import { ToolCallCard } from '@/src/components/tools/ToolCards';
import ChatLine from '@/src/task-types/rag/components/ChatLine';
import ToolCallingCopier from '@/src/task-types/tool_calling/Copier';

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

// --- Main component ---

export default function ToolCallingTaskView({
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

  const targetCalls = useMemo(() => {
    if (!task.targets) return undefined;
    const target = task.targets.find((t) => t.type === 'tool_calls');
    return target?.type === 'tool_calls' ? target.calls : undefined;
  }, [task.targets]);

  const hasTools = Array.isArray(task.tools) && task.tools.length > 0;

  return (
    <>
      {models && metrics && task && results && (
        <ToolCallingCopier
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
          {/* Left column: conversation + available tools */}
          <div className={classes.inputContainer}>
            <ContainedList label="Conversation" kind="on-page">
              <ContainedListItem>
                <div className={classes.conversationContent}>
                  {Array.isArray(task.input) ? (
                    task.input.map((message, idx) => (
                      <ChatLine
                        key={`tc-message--${idx}`}
                        messageId={`tc-message--${idx}`}
                        message={message}
                        onSelection={updateCommentProvenance}
                        focused={idx === task.input.length - 1}
                        latestResponse={idx === task.input.length - 1}
                      />
                    ))
                  ) : typeof task.input === 'string' ? (
                    <p>{task.input}</p>
                  ) : null}
                </div>
              </ContainedListItem>
            </ContainedList>

            {hasTools && (
              <>
                <hr className={classes.inputDivider} />
                <ContainedList label="Available Tools" kind="on-page">
                  <ContainedListItem>
                    <AvailableToolsPanel tools={task.tools!} />
                  </ContainedListItem>
                </ContainedList>
              </>
            )}
          </div>

          <div className={classes.separator} />

          {/* Right column: per-model tabs */}
          <div className={classes.modelsContainer}>
            <Tabs>
              <TabList aria-label="Models" contained fullWidth>
                {results.map((result) => (
                  <Tab key={`tc-model-${result.modelId}`}>
                    {truncate(
                      models.get(result.modelId)?.name || result.modelId,
                      15,
                    )}
                  </Tab>
                ))}
              </TabList>
              <TabPanels>
                {results.map((result) => {
                  const trace = result.output[0]?.trace;
                  const hasTrace = Array.isArray(trace) && trace.length > 0;

                  return (
                    <TabPanel key={`tc-model-${result.modelId}-panel`}>
                      <div className={classes.tabContainer}>
                        {/* Prediction — always visible; model-scoped provenance */}
                        <div
                          onMouseDown={() =>
                            updateCommentProvenance(
                              `${result.modelId}::evaluation::prediction`,
                            )
                          }
                          onMouseUp={() =>
                            updateCommentProvenance(
                              `${result.modelId}::evaluation::prediction`,
                            )
                          }
                        >
                          <ContainedList label="Prediction" kind="on-page">
                            <ContainedListItem>
                              {result.output[0]?.tool_calls &&
                              result.output[0].tool_calls.length > 0 ? (
                                <div className={classes.callList}>
                                  {result.output[0].tool_calls.map((call) => {
                                    const calls = result.output[0].tool_calls!;
                                    const defaultExpanded =
                                      calls.length <= 2 &&
                                      JSON.stringify(call.arguments).length <=
                                        120;
                                    return (
                                      <ToolCallCard
                                        key={call.id}
                                        call={call}
                                        defaultExpanded={defaultExpanded}
                                      />
                                    );
                                  })}
                                </div>
                              ) : !result.output[0]?.tool_calls &&
                                result.output[0]?.content === '' ? (
                                <span className={classes.noCallBadge}>
                                  No tool call made (correct for irrelevance
                                  tasks)
                                </span>
                              ) : typeof result.output[0]?.content ===
                                'string' ? (
                                <p>{result.output[0].content}</p>
                              ) : (
                                <span className={classes.notProvided}>
                                  No output
                                </span>
                              )}
                            </ContainedListItem>
                          </ContainedList>
                        </div>

                        {/* Target — always visible; task-scoped provenance */}
                        <div
                          onMouseDown={() => updateCommentProvenance('target')}
                          onMouseUp={() => updateCommentProvenance('target')}
                        >
                          <ContainedList label="Target" kind="on-page">
                            <ContainedListItem>
                              {targetCalls && targetCalls.length > 0 ? (
                                <div className={classes.callList}>
                                  {targetCalls.map((call) => {
                                    const defaultExpanded =
                                      targetCalls.length <= 2 &&
                                      JSON.stringify(call.arguments).length <=
                                        120;
                                    return (
                                      <ToolCallCard
                                        key={call.id}
                                        call={call}
                                        defaultExpanded={defaultExpanded}
                                      />
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className={classes.notProvided}>
                                  Not provided
                                </span>
                              )}
                            </ContainedListItem>
                          </ContainedList>
                        </div>

                        {/* Secondary detail: Evaluations and Steps as tabs */}
                        <hr className={classes.sectionDivider} />

                        <Tabs>
                          <TabList
                            aria-label="Result details"
                            contained
                            fullWidth
                          >
                            <Tab>Evaluations</Tab>
                            {/* Trace tab is always rendered; disabled when no trace data */}
                            <Tab disabled={!hasTrace}>Trace</Tab>
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
                              {hasTrace && <TraceGroup trace={trace!} />}
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
