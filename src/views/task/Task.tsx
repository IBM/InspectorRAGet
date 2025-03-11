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
import { useMemo, useState, useEffect } from 'react';
import { Tag, Tooltip } from '@carbon/react';
import { AddComment } from '@carbon/icons-react';

import { Model, TaskCommentProvenance, TaskEvaluation } from '@/src/types';
import { useDataStore } from '@/src/store';
import { extractMouseSelection } from '@/src/utilities/selectors';
import { useNotification } from '@/src/components/notification/Notification';
import TaskTile from '@/src/components/task-tile/TaskTile';
import AddCommentModal from '@/src/components/comments/AddCommentModal';
import ViewComments from '@/src/components/comments/CommentsViewer';
import RAGTask from '@/src/views/task/RAGTask';
import TextGenerationTask from '@/src/views/task/TextGenerationTask';
import ChatTask from '@/src/views/task/ChatTask';

import classes from './Task.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  taskId: string;
  onClose: Function;
}

// ===================================================================================
//                               HELPER FUNCTIONS
// ===================================================================================
/**
 * Update existing provenance
 * @param component reference location
 * @param setCommentProvenance function to update state variable
 * @param createNotification function to notify user of any issues with selection
 */
function updateCommentProvenance(
  component: string,
  setCommentProvenance: Function,
  createNotification: Function,
) {
  try {
    const [text, offsets] = extractMouseSelection();
    if (text !== '') {
      setCommentProvenance({
        component: component,
        text: text,
        offsets: offsets,
      });
    }
  } catch (err) {
    // Notify user
    createNotification({
      kind: 'error',
      title: 'Invalid selection',
      subtitle: 'cannot select text from different part of the page.',
    });

    // Reset selection
    setCommentProvenance(undefined);
  }
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function Task({ taskId, onClose }: Props) {
  // Step 1: Initialize state and necessary variables
  const [addCommentModalOpen, setAddCommentModalOpen] =
    useState<boolean>(false);
  const [taskCopierModalOpen, setTaskCopierModalOpen] =
    useState<boolean>(false);
  const [commentProvenance, setCommentProvenance] = useState<
    TaskCommentProvenance | undefined
  >(undefined);

  // Step 2: Run effects
  // Step 2.a: Notification hook
  const { createNotification } = useNotification();

  // Step 2.b: Handle task close event
  useEffect(() => {
    const handleEsc = (event) => {
      // If "Escape" key is pressed
      if (event.key === 'Escape') {
        // Step 1: Close task view
        onClose();

        // Step 2: Stop event propogation
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', handleEsc);

    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // Step 2.c: Fetch data from data store
  const { item: data, taskMap, updateTask } = useDataStore();

  // Step 2.d: Configure model's map and metrics
  const [models, metrics] = useMemo(() => {
    if (data) {
      // Step 2.d.i: Make model_id -> model_name map
      const modelsMap = new Map<string, Model>(
        data.models.map((model) => [model.modelId, model]),
      );

      return [modelsMap, data.metrics];
    }

    // Default return
    return [undefined, undefined];
  }, [data?.models, data?.metrics]);

  // Step 2.e: Fetch task
  const task = useMemo(() => {
    if (taskMap && taskId) {
      return taskMap.get(taskId);
    }
  }, [taskId, taskMap]);

  // Step 2.f: Initialize comment viewer status
  const [showComments, setShowComments] = useState<boolean>(
    (task?.comments?.length && task.comments.length > 0) || false,
  );

  // Step 2.g: Fetch evaluations for the current task
  const evaluations = useMemo(() => {
    let taskEvaluations: TaskEvaluation[] | undefined = undefined;
    if (data) {
      taskEvaluations = data.evaluations.filter(
        (evaluation) => evaluation.taskId === taskId,
      );
    }

    return taskEvaluations;
  }, [taskId, task?.contexts, data?.documents, data?.evaluations]);

  // Step 3: Render
  return (
    <div className={classes.page}>
      <AddCommentModal
        open={addCommentModalOpen}
        selectedText={commentProvenance ? commentProvenance.text : undefined}
        onSubmit={(comment: string, author: string) => {
          // Step 1: Create comment to add
          const commentToAdd = {
            comment: comment,
            author: author,
            created: Date.now(),
            updated: Date.now(),
            provenance: commentProvenance,
          };

          // Step 2: Add comment to task
          updateTask(taskId, {
            comments: task?.comments
              ? [...task?.comments, commentToAdd]
              : [commentToAdd],
          });

          // Step 3: Clear provenance
          setCommentProvenance(undefined);

          // Step 4: Close modal
          setAddCommentModalOpen(false);

          // Step 5: Open comments viewer
          setShowComments(true);
        }}
        onClose={() => {
          // Clear provenance
          setCommentProvenance(undefined);

          // Close modal
          setAddCommentModalOpen(false);
        }}
        provenance={commentProvenance}
        models={models}
      ></AddCommentModal>
      <div className={classes.pageHint}>
        <Tag
          type={'outline'}
          onClick={() => {
            onClose();
          }}
        >
          Press 'Escape' to close
        </Tag>
      </div>
      {task && evaluations && (
        <div>
          <TaskTile
            task={task}
            evaluations={evaluations}
            expanded={false}
            onClickFlagIcon={() => {
              // Step 1.a: Update global copy
              updateTask(task.taskId, {
                flagged: !task?.flagged,
              });
            }}
            onClickCommentsIcon={() => {
              setShowComments(!showComments);
            }}
            onClickCopyToClipboardIcon={() => {
              setTaskCopierModalOpen(true);
            }}
          ></TaskTile>
        </div>
      )}
      {task && models && evaluations && (
        <div className={classes.taskContainer}>
          {task.comments && !isEmpty(task.comments) && showComments && (
            <div className={classes.commentsContainer}>
              <ViewComments
                comments={task.comments}
                onUpdate={(updatedComments) => {
                  updateTask(taskId, {
                    comments: updatedComments,
                  });
                }}
                models={models}
              ></ViewComments>
            </div>
          )}
          {task.taskType === 'rag' ? (
            <RAGTask
              task={task}
              models={models}
              metrics={metrics}
              taskCopierModalOpen={taskCopierModalOpen}
              setTaskCopierModalOpen={setTaskCopierModalOpen}
              updateCommentProvenance={(provenance: string) => {
                updateCommentProvenance(
                  provenance,
                  setCommentProvenance,
                  createNotification,
                );
              }}
            />
          ) : task.taskType === 'text_generation' ? (
            <TextGenerationTask
              task={task}
              models={models}
              metrics={metrics}
              taskCopierModalOpen={taskCopierModalOpen}
              setTaskCopierModalOpen={setTaskCopierModalOpen}
              updateCommentProvenance={(provenance: string) => {
                updateCommentProvenance(
                  provenance,
                  setCommentProvenance,
                  createNotification,
                );
              }}
            />
          ) : task.taskType === 'chat' ? (
            <ChatTask
              task={task}
              models={models}
              metrics={metrics}
              taskCopierModalOpen={taskCopierModalOpen}
              setTaskCopierModalOpen={setTaskCopierModalOpen}
              updateCommentProvenance={(provenance: string) => {
                updateCommentProvenance(
                  provenance,
                  setCommentProvenance,
                  createNotification,
                );
              }}
            />
          ) : null}
          <div
            key={'add-comment-btn'}
            tabIndex={0}
            className={classes.addCommentBtn}
            onClick={() => {
              setAddCommentModalOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setAddCommentModalOpen(true);
              }
            }}
          >
            <Tooltip align={'top-right'} label={'Click to add comment'}>
              <AddComment size={20}></AddComment>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
}
