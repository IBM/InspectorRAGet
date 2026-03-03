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
import { taskTypeRegistry } from '@/src/task-types';

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
  const [addCommentModalOpen, setAddCommentModalOpen] =
    useState<boolean>(false);
  const [taskCopierModalOpen, setTaskCopierModalOpen] =
    useState<boolean>(false);
  const [commentProvenance, setCommentProvenance] = useState<
    TaskCommentProvenance | undefined
  >(undefined);

  const { createNotification } = useNotification();

  // Close task view on Escape key press
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        onClose();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', handleEsc);

    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally register once; onClose is stable for the lifetime of the overlay
  }, []);

  const { item: data, taskMap, updateTask } = useDataStore();

  const [models, metrics] = useMemo(() => {
    if (data) {
      const modelsMap = new Map<string, Model>(
        data.models.map((model) => [model.modelId, model]),
      );

      return [modelsMap, data.metrics];
    }

    // Default return
    return [undefined, undefined];
  }, [data]);

  const task = useMemo(() => {
    if (taskMap && taskId) {
      return taskMap.get(taskId);
    }
  }, [taskId, taskMap]);

  const [showComments, setShowComments] = useState<boolean>(
    (task?.comments?.length && task.comments.length > 0) || false,
  );

  const evaluations = useMemo(() => {
    if (data) {
      return data.evaluations.filter(
        (evaluation) => evaluation.taskId === taskId,
      );
    }
    return undefined;
  }, [taskId, data]);

  // Look up the task-type-specific view component from the registry.
  // Falls back to null for unknown or future task types not yet in registry.
  const TaskView = task?.taskType
    ? taskTypeRegistry[task.taskType]?.TaskView
    : null;

  return (
    <div className={classes.page}>
      <AddCommentModal
        open={addCommentModalOpen}
        selectedText={commentProvenance ? commentProvenance.text : undefined}
        onSubmit={(comment: string, author: string) => {
          const commentToAdd = {
            comment: comment,
            author: author,
            created: Date.now(),
            updated: Date.now(),
            provenance: commentProvenance,
          };

          updateTask(taskId, {
            comments: task?.comments
              ? [...task?.comments, commentToAdd]
              : [commentToAdd],
          });

          setCommentProvenance(undefined);
          setAddCommentModalOpen(false);
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
          {TaskView ? (
            <TaskView
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
