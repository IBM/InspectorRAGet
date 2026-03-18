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
import DOMPurify from 'dompurify';
import parse from 'html-react-parser';
import { useMemo, useState } from 'react';
import {
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  ContainedList,
  ContainedListItem,
  InlineNotification,
} from '@carbon/react';

import { Model, ModelResult, Task, Metric, outputAsText } from '@/src/types';
import { useDataStore } from '@/src/store';
import { truncate } from '@/src/utilities/strings';

import EvaluationsPanel from '@/src/components/evaluations/EvaluationsPanel';
import StepGroup from '@/src/components/steps/StepGroup';
import ChatLine from '@/src/task-types/rag/components/ChatLine';
import RAGCopier from '@/src/task-types/rag/Copier';

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

export default function RAGTaskView({
  task,
  models,
  metrics,
  taskCopierModalOpen,
  setTaskCopierModalOpen,
  updateCommentProvenance,
}: Props) {
  const [selectedResultIndex, setSelectedResultIndex] = useState<number>(0);

  const { item: data } = useDataStore();

  const results = useMemo(() => {
    let taskResults: ModelResult[] | undefined = undefined;
    if (data) {
      taskResults = data.results.filter(
        (result) => result.taskId === task.taskId,
      );
    }

    return taskResults;
  }, [task.taskId, data]);

  const [hMetrics, aMetrics] = useMemo(() => {
    const humanMetrics = new Map(
      metrics
        ?.filter((metric) => metric.author === 'human')
        .map((metric) => [metric.name, metric]),
    );
    const algorithmicMetrics = new Map(
      metrics
        ?.filter((metric) => metric.author === 'algorithm')
        .map((metric) => [metric.name, metric]),
    );

    return [humanMetrics, algorithmicMetrics];
  }, [metrics]);

  return (
    <>
      {models && metrics && task && results && (
        <RAGCopier
          open={taskCopierModalOpen}
          models={Array.from(models.values())}
          metrics={metrics}
          task={task}
          results={results}
          onClose={() => {
            setTaskCopierModalOpen(false);
          }}
        ></RAGCopier>
      )}
      {task && models && results && (
        <div className={classes.layout}>
          <div className={classes.inputContainer}>
            {Array.isArray(task.input)
              ? task.input.map((message, messageIdx) => (
                  <ChatLine
                    key={`data_point__message--${messageIdx}`}
                    messageId={`data_point__message--${messageIdx}`}
                    message={message}
                    onSelection={updateCommentProvenance}
                    focused={
                      Array.isArray(task.input) &&
                      messageIdx === task.input.length - 1
                        ? true
                        : false
                    }
                    latestResponse={
                      Array.isArray(task.input) &&
                      messageIdx === task.input.length - 1
                        ? true
                        : false
                    }
                  ></ChatLine>
                ))
              : null}
          </div>

          <div className={classes.separator} />

          <div className={classes.modelsContainer}>
            <Tabs
              onChange={(e) => {
                setSelectedResultIndex(e.selectedIndex);
              }}
            >
              <TabList aria-label="Models tab" contained fullWidth>
                {results.map((result) => (
                  <Tab key={'model-' + result.modelId}>
                    {truncate(
                      models.get(result.modelId)?.name || result.modelId,
                      15,
                    )}
                  </Tab>
                ))}
              </TabList>
              <TabPanels>
                {results.map((result) => (
                  <TabPanel key={'model-' + result.modelId + '-panel'}>
                    <div className={classes.tabContainer}>
                      <ContainedList label="Response" kind="on-page">
                        <ContainedListItem>
                          <div
                            className={classes.responseContainer}
                            onMouseDown={() => {
                              updateCommentProvenance(
                                `${result.modelId}::evaluation::response`,
                              );
                            }}
                            onMouseUp={() =>
                              updateCommentProvenance(
                                `${result.modelId}::evaluation::response`,
                              )
                            }
                          >
                            {parse(
                              DOMPurify.sanitize(outputAsText(result.output)),
                            )}
                          </div>
                        </ContainedListItem>
                      </ContainedList>

                      <ContainedList label="Targets" kind="on-page">
                        {task.targets && !isEmpty(task.targets) ? (
                          task.targets.length > 1 ? (
                            task.targets.map((target, targetIdx) =>
                              target.type === 'text' ? (
                                <ContainedListItem key={`target--${targetIdx}`}>
                                  <span>
                                    Target {targetIdx + 1}: {target.value}
                                  </span>
                                </ContainedListItem>
                              ) : null,
                            )
                          ) : task.targets[0].type === 'text' ? (
                            <ContainedListItem key={`target--0`}>
                              <span>{task.targets[0].value}</span>
                            </ContainedListItem>
                          ) : null
                        ) : (
                          <ContainedListItem>
                            <span className={classes.notProvided}>
                              Not provided
                            </span>
                          </ContainedListItem>
                        )}
                      </ContainedList>

                      <hr className={classes.sectionDivider} />

                      <Tabs>
                        <TabList
                          aria-label="Result details"
                          contained
                          fullWidth
                        >
                          <Tab>Evaluations</Tab>
                          <Tab
                            disabled={
                              !(
                                Array.isArray(result.output[0]?.steps) &&
                                result.output[0].steps!.length > 0
                              )
                            }
                          >
                            Steps
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
                            {Array.isArray(result.output[0]?.steps) &&
                              result.output[0].steps!.length > 0 && (
                                <>
                                  {!result.output[0].steps!.some(
                                    (s) => s.startTimestamp !== undefined,
                                  ) && (
                                    <InlineNotification
                                      kind="info"
                                      title="Auto-constructed steps"
                                      subtitle="These steps were derived from the message thread and may not reflect actual execution order."
                                      lowContrast
                                      hideCloseButton
                                    />
                                  )}
                                  <StepGroup
                                    steps={result.output[0].steps!}
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
                ))}
              </TabPanels>
            </Tabs>
          </div>
        </div>
      )}
    </>
  );
}
