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
  Search,
  Tag,
  InlineNotification,
} from '@carbon/react';
import { ChevronDown, ChevronUp, Function, ToolKit } from '@carbon/icons-react';

import {
  Model,
  ModelResult,
  Task,
  Metric,
  ToolCallRecord,
  ToolDefinition,
} from '@/src/types';
import { useDataStore } from '@/src/store';
import { truncate } from '@/src/utilities/strings';

import EvaluationsPanel from '@/src/components/evaluations/EvaluationsPanel';
import StepGroup from '@/src/components/steps/StepGroup';
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

// --- Render helpers ---

function ToolCallCard({ call }: { call: ToolCallRecord }) {
  const [expanded, setExpanded] = useState(false);
  const hasArgs = !isEmpty(call.arguments);

  return (
    <div className={classes.callCard}>
      {/* Entire header row is clickable when arguments exist */}
      <div
        className={`${classes.callCardHeader} ${hasArgs ? classes.callCardHeaderClickable : ''}`}
        onClick={hasArgs ? () => setExpanded((prev) => !prev) : undefined}
        role={hasArgs ? 'button' : undefined}
        aria-expanded={hasArgs ? expanded : undefined}
      >
        <Function size={16} />
        <span>{call.name}</span>
        {call.id && (
          <Tag type="cool-gray" size="sm">
            {call.id}
          </Tag>
        )}
        {/* Decorative chevron — click is handled by the parent header div */}
        {hasArgs && (
          <span className={classes.expandToggle} aria-hidden>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </div>
      {call.dependsOn && (
        <span className={classes.callDependency}>
          depends on: {call.dependsOn}
        </span>
      )}
      {hasArgs && expanded && (
        <div className={classes.argumentsBlock}>
          <CodeSnippet type="multi" hideCopyButton wrapText>
            {JSON.stringify(call.arguments, null, 2)}
          </CodeSnippet>
        </div>
      )}
    </div>
  );
}

function ToolDefinitionCard({ tool }: { tool: ToolDefinition }) {
  const [expanded, setExpanded] = useState(false);
  const hasContent =
    !!tool.description ||
    (!!tool.parameters?.properties && !isEmpty(tool.parameters.properties));

  return (
    <div className={classes.callCard}>
      <div
        className={`${classes.callCardHeader} ${hasContent ? classes.callCardHeaderClickable : ''}`}
        onClick={hasContent ? () => setExpanded((prev) => !prev) : undefined}
        role={hasContent ? 'button' : undefined}
        aria-expanded={hasContent ? expanded : undefined}
      >
        <ToolKit size={16} />
        <span>{tool.name}</span>
        {hasContent && (
          <span className={classes.expandToggle} aria-hidden>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </div>
      {hasContent && expanded && (
        <div className={classes.toolDefinitionContent}>
          {tool.description && (
            <p className={classes.toolDescription}>{tool.description}</p>
          )}
          {tool.parameters?.properties &&
            !isEmpty(tool.parameters.properties) && (
              <ul className={classes.toolParamList}>
                {Object.entries(tool.parameters.properties).map(
                  ([paramName, paramDef]) => {
                    const isRequired =
                      tool.parameters?.required?.includes(paramName);
                    return (
                      <li key={paramName}>
                        <strong>{paramName}</strong>
                        {paramDef.type ? ` (${paramDef.type})` : ''}
                        {isRequired && (
                          <span className={classes.toolParamRequired}> *</span>
                        )}
                        {paramDef.description
                          ? ` — ${paramDef.description}`
                          : ''}
                        {paramDef.enum
                          ? ` [${(paramDef.enum as string[]).join(', ')}]`
                          : ''}
                      </li>
                    );
                  },
                )}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}

function AvailableToolsPanel({ tools }: { tools: ToolDefinition[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return tools;
    const lower = query.toLowerCase();
    // Match on name or description — not parameter schemas, which are not human-searchable
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.description?.toLowerCase().includes(lower),
    );
  }, [tools, query]);

  return (
    <>
      <Search
        className={classes.toolsSearch}
        size="sm"
        labelText="Search tools"
        placeholder="Search by name or description"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className={classes.callList}>
        {filtered.map((tool) => (
          <ToolDefinitionCard key={tool.name} tool={tool} />
        ))}
      </div>
    </>
  );
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
                  const hasSteps =
                    Array.isArray(result.modelSteps) &&
                    result.modelSteps.length > 0;
                  const hasTimestamps = hasSteps
                    ? result.modelSteps!.some(
                        (s) => s.startTimestamp !== undefined,
                      )
                    : false;

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
                              {result.output.type === 'tool_calls' &&
                              result.output.calls.length > 0 ? (
                                <div className={classes.callList}>
                                  {result.output.calls.map((call) => (
                                    <ToolCallCard key={call.id} call={call} />
                                  ))}
                                </div>
                              ) : result.output.type === 'text' &&
                                result.output.value === '' ? (
                                <span className={classes.noCallBadge}>
                                  No tool call made (correct for irrelevance
                                  tasks)
                                </span>
                              ) : result.output.type === 'text' ? (
                                <p>{result.output.value}</p>
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
                                  {targetCalls.map((call) => (
                                    <ToolCallCard key={call.id} call={call} />
                                  ))}
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
                            {/* Steps tab is always rendered; disabled when no steps data */}
                            <Tab disabled={!hasSteps}>Steps</Tab>
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
                              {hasSteps && (
                                <>
                                  {!hasTimestamps && (
                                    <InlineNotification
                                      kind="info"
                                      title="Auto-constructed steps"
                                      subtitle="These steps were derived from the message thread and may not reflect actual execution order."
                                      lowContrast
                                      hideCloseButton
                                    />
                                  )}
                                  <StepGroup
                                    steps={result.modelSteps!}
                                    onStepMouseDown={(stepId) =>
                                      updateCommentProvenance(
                                        `${result.modelId}::steps::${stepId}`,
                                      )
                                    }
                                  />
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
