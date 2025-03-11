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
} from '@carbon/react';

import { Model, TaskEvaluation, Task, Metric } from '@/src/types';
import { useDataStore } from '@/src/store';
import { truncate } from '@/src/utilities/strings';

import AnnotationsTable from '@/src/views/annotations-table/AnnotationsTable';
import ChatLine from '@/src/components/chatline/ChatLine';
import TaskCopierModal from '@/src/views/task/TaskCopier';

import classes from './ChatTask.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  task: Task;
  models: Map<string, Model>;
  metrics: Metric[];
  taskCopierModalOpen: boolean;
  setTaskCopierModalOpen: Function;
  updateCommentProvenance: Function;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function ChatTask({
  task,
  models,
  metrics,
  taskCopierModalOpen,
  setTaskCopierModalOpen,
  updateCommentProvenance,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [selectedEvaluationIndex, setSelectedEvaluationIndex] =
    useState<number>(0);
  const [activeDocumentIndex, setActiveDocumentIndex] = useState<number>(0);

  // Step 2: Run effects
  // Step 2.a: Fetch data from data store
  const { item: data } = useDataStore();

  // Step 2.b: Fetch documents and evaluations
  const evaluations = useMemo(() => {
    // Step 2.b.i: Fetch evaluations
    let taskEvaluations: TaskEvaluation[] | undefined = undefined;
    if (data) {
      taskEvaluations = data.evaluations.filter(
        (evaluation) => evaluation.taskId === task.taskId,
      );
    }

    return taskEvaluations;
  }, [task.taskId, data]);

  // Step 2.c: Build human & algorithmic metric maps
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

  console.log(task);
  // Step 3: Render
  return (
    <>
      {task && models && evaluations && (
        <>
          <div className={classes.inputContainer}>
            {Array.isArray(task.input)
              ? task.input.map((message, messageIdx) => (
                  <ChatLine
                    key={`data_point__message--${messageIdx}`}
                    messageId={`data_point__message--${messageIdx}`}
                    message={message}
                    onSelection={updateCommentProvenance}
                    focused={false}
                  ></ChatLine>
                ))
              : null}
          </div>

          <div className={classes.separator} />

          <div className={classes.modelsContainer}>
            <Tabs
              onChange={(e) => {
                setSelectedEvaluationIndex(e.selectedIndex);
                setActiveDocumentIndex(0);
              }}
            >
              <TabList
                className={classes.tabList}
                aria-label="Models tab"
                contained
              >
                {evaluations.map((evaluation) => (
                  <Tab key={'model-' + evaluation.modelId}>
                    {truncate(
                      models.get(evaluation.modelId)?.name ||
                        evaluation.modelId,
                      15,
                    )}
                  </Tab>
                ))}
              </TabList>
              <TabPanels>
                {evaluations.map((evaluation) => (
                  <TabPanel key={'model-' + evaluation.modelId + '-panel'}>
                    <div className={classes.tabContainer}>
                      <div className={classes.tabContentHeader}>
                        <h5>Model:</h5>
                        <span>
                          {models.get(evaluation.modelId)?.name ||
                            evaluation.modelId}
                        </span>
                      </div>
                      <ContainedList
                        size="sm"
                        label="Response"
                        kind="disclosed"
                      >
                        <ContainedListItem>
                          <div
                            className={classes.responseContainer}
                            onMouseDown={() => {
                              updateCommentProvenance(
                                `${evaluation.modelId}::evaluation::response`,
                              );
                            }}
                            onMouseUp={() =>
                              updateCommentProvenance(
                                `${evaluation.modelId}::evaluation::response`,
                              )
                            }
                          >
                            {parse(
                              DOMPurify.sanitize(evaluation.modelResponse),
                            )}
                          </div>
                        </ContainedListItem>
                      </ContainedList>

                      {task.targets && !isEmpty(task.targets) ? (
                        <ContainedList
                          label="Targets"
                          kind="disclosed"
                          size="sm"
                        >
                          {task.targets.length > 1 ? (
                            task.targets.map((target, targetIdx) =>
                              target.text ? (
                                <ContainedListItem key={`target--${targetIdx}`}>
                                  <span>
                                    Target {targetIdx + 1}: {target.text}
                                  </span>
                                </ContainedListItem>
                              ) : null,
                            )
                          ) : (
                            <ContainedListItem key={`target--0`}>
                              <span>{task.targets[0].text}</span>
                            </ContainedListItem>
                          )}
                        </ContainedList>
                      ) : null}
                      {evaluation.annotations && hMetrics.size ? (
                        <>
                          <h5>Human Evaluations:</h5>
                          <AnnotationsTable
                            annotations={evaluation.annotations}
                            metrics={[...hMetrics.values()]}
                          ></AnnotationsTable>
                        </>
                      ) : null}
                      {evaluation.annotations && aMetrics.size ? (
                        <>
                          <h5>Algorithmic Evaluations:</h5>
                          <AnnotationsTable
                            annotations={evaluation.annotations}
                            metrics={[...aMetrics.values()]}
                          ></AnnotationsTable>
                        </>
                      ) : null}
                    </div>
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          </div>
        </>
      )}
    </>
  );
}
