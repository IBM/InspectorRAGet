/**
 *
 * Copyright 2023-2024 InspectorRAGet Team
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
  Button,
  ContainedList,
  ContainedListItem,
} from '@carbon/react';
import { TextHighlight } from '@carbon/icons-react';

import { Model, TaskEvaluation, Task, Metric } from '@/src/types';
import { useDataStore } from '@/src/store';
import { truncate, overlaps } from '@/src/utilities/strings';
import { mark } from '@/src/utilities/highlighter';

import AnnotationsTable from '@/src/views/annotations-table/AnnotationsTable';
import TaskCopierModal from '@/src/views/task/TaskCopier';

import classes from './TextGenerationTask.module.scss';

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
export default function TextGenerationTask({
  task,
  models,
  metrics,
  taskCopierModalOpen,
  setTaskCopierModalOpen,
  updateCommentProvenance,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [selectedModelIndex, setSelectedModelIndex] = useState<number>(0);
  const [showOverlap, setShowOverlap] = useState<boolean>(false);

  // Step 2: Run effects
  // Step 2.a: Fetch data from data store
  const { item: data } = useDataStore();

  // Step 2.b: Fetch evaluations for the current task
  const evaluations = useMemo(() => {
    // Step 2.b.i: Fetch evaluations
    let taskEvaluations: TaskEvaluation[] | undefined = undefined;
    if (data) {
      taskEvaluations = data.evaluations.filter(
        (evaluation) => evaluation.taskId === task.taskId,
      );

      // Step 2.b.ii: Compute input-response overlap and add to evaluation object
      taskEvaluations.forEach((evaluation) => {
        if (typeof task.input === 'string') {
          evaluation.overlaps = overlaps(evaluation.modelResponse, task.input);
        } else {
          evaluation.overlaps = [];
        }
      });
    }

    return taskEvaluations;
  }, [task.taskId, task.input, data]);

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

  // Step 3: Render
  return (
    <>
      {models && metrics && task && evaluations && (
        <TaskCopierModal
          open={taskCopierModalOpen}
          models={Array.from(models.values())}
          metrics={metrics}
          task={task}
          evaluations={evaluations}
          onClose={() => {
            setTaskCopierModalOpen(false);
          }}
        ></TaskCopierModal>
      )}

      {task && models && evaluations && (
        <>
          <div className={classes.inputContainer}>
            {typeof task.input === 'string' ? (
              <>
                <div className={classes.header}>
                  <h4>Input</h4>
                  <div className={classes.headerActions}>
                    <Button
                      id="text-highlight"
                      renderIcon={TextHighlight}
                      kind={'ghost'}
                      hasIconOnly={true}
                      iconDescription={
                        'Click to highlight text common in input and response'
                      }
                      tooltipAlignment={'end'}
                      tooltipPosition={'bottom'}
                      onClick={() => {
                        setShowOverlap(!showOverlap);
                      }}
                    />
                  </div>
                </div>
                <div className={classes.disclaimers}>
                  {showOverlap && (
                    <div className={classes.overlapDisclaimer}>
                      <div className={classes.legendCopiedText}>&#9632;</div>
                      <span>
                        &nbsp;marks text assumed to be copied from input into
                        model response
                      </span>
                    </div>
                  )}
                </div>
                <div
                  className={classes.inputTextContainer}
                  onMouseDown={() => {
                    updateCommentProvenance('input');
                  }}
                  onMouseUp={() => updateCommentProvenance('input')}
                >
                  <p>
                    {parse(
                      DOMPurify.sanitize(
                        showOverlap
                          ? mark(
                              task.input,
                              evaluations[selectedModelIndex].overlaps,
                              'target',
                            )
                          : task.input,
                      ),
                    )}
                  </p>
                </div>
              </>
            ) : null}
          </div>

          <div className={classes.evaluationsContainer}>
            <Tabs
              onChange={(e) => {
                setSelectedModelIndex(e.selectedIndex);
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
                              DOMPurify.sanitize(
                                showOverlap
                                  ? mark(
                                      evaluation.modelResponse,
                                      evaluation.overlaps,
                                      'source',
                                    )
                                  : evaluation.modelResponse,
                              ),
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
                          {task.targets.map((target, targetIdx) =>
                            target.text ? (
                              <ContainedListItem key={`target--${targetIdx}`}>
                                <span>
                                  Target {targetIdx + 1}: {target.text}
                                </span>
                              </ContainedListItem>
                            ) : null,
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
