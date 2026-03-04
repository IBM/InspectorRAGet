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

import { useMemo, useState, useEffect } from 'react';
import { Tag, Tooltip } from '@carbon/react';
import { AddComment } from '@carbon/icons-react';

import { Model, TaskCommentProvenance, CommentFinding } from '@/src/types';
import { useDataStore } from '@/src/store';
import { extractMouseSelection } from '@/src/utilities/selectors';
import { useNotification } from '@/src/components/notification/Notification';
import TaskTile from '@/src/components/task-tile/TaskTile';
import AddCommentModal from '@/src/components/comments/AddCommentModal';
import ViewComments from '@/src/components/comments/CommentsViewer';
import SelectionCommentButton from '@/src/components/comments/SelectionCommentButton';
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

// A component string contains '::' when the selection comes from a model-specific
// area (e.g. "model123::evaluation::prediction"). Task-level areas use plain names.
function isModelScoped(component: string): boolean {
  return component.includes('::');
}

function modelIdFromComponent(component: string): string {
  return component.split('::')[0];
}

/**
 * Reads the current window selection and, if non-empty, updates provenance state.
 * Notifies the user if the selection spans incompatible DOM nodes.
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
    createNotification({
      kind: 'error',
      title: 'Invalid selection',
      subtitle: 'cannot select text from different part of the page.',
    });
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
  // Viewport coords from the mouseup event — used to position the floating button.
  const [selectionCoords, setSelectionCoords] = useState<
    { x: number; y: number } | undefined
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

  const {
    item: data,
    taskMap,
    updateTask,
    resultsMap,
    updateResult,
  } = useDataStore();

  const [models, metrics] = useMemo(() => {
    if (data) {
      const modelsMap = new Map<string, Model>(
        data.models.map((model) => [model.modelId, model]),
      );

      return [modelsMap, data.metrics];
    }

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

  // Merge live resultsMap entries so model-level comment updates are reactive.
  const results = useMemo(() => {
    if (!data || !resultsMap) return undefined;
    return data.results
      .filter((r) => r.taskId === taskId)
      .map((r) => resultsMap.get(`${r.taskId}::${r.modelId}`) ?? r);
  }, [taskId, data, resultsMap]);

  // Show the panel toggle only when there's something to show.
  const hasAnyComments = useMemo(
    () =>
      (task?.comments?.length ?? 0) > 0 ||
      (results?.some((r) => (r.comments?.length ?? 0) > 0) ?? false),
    [task, results],
  );

  // Look up the task-type-specific view component from the registry.
  // Falls back to null for unknown or future task types not yet in registry.
  const TaskView = task?.taskType
    ? taskTypeRegistry[task.taskType]?.TaskView
    : null;

  // Build the resultComments prop for CommentsViewer once per render.
  const resultComments = useMemo(() => {
    if (!results || !models) return [];
    return results
      .filter((r) => (r.comments?.length ?? 0) > 0)
      .map((r) => ({
        modelId: r.modelId,
        modelName: models.get(r.modelId)?.name ?? r.modelId,
        comments: r.comments!,
      }));
  }, [results, models]);

  return (
    // Dismiss the floating button on any mousedown outside it.
    // The button itself calls stopPropagation so clicks on it don't land here.
    <div
      className={classes.page}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-selection-comment-btn]')) {
          setSelectionCoords(undefined);
        }
      }}
    >
      <AddCommentModal
        open={addCommentModalOpen}
        selectedText={commentProvenance ? commentProvenance.text : undefined}
        onSubmit={(
          comment: string,
          author: string,
          finding?: CommentFinding,
        ) => {
          const commentToAdd = {
            comment,
            author,
            created: Date.now(),
            updated: Date.now(),
            provenance: commentProvenance,
            finding,
          };

          if (commentProvenance && isModelScoped(commentProvenance.component)) {
            // Route model-scoped comments (e.g. prediction area) to ModelResult.
            const modelId = modelIdFromComponent(commentProvenance.component);
            const result = results?.find((r) => r.modelId === modelId);
            updateResult(taskId, modelId, {
              comments: result?.comments
                ? [...result.comments, commentToAdd]
                : [commentToAdd],
            });
          } else {
            updateTask(taskId, {
              comments: task?.comments
                ? [...task.comments, commentToAdd]
                : [commentToAdd],
            });
          }

          setCommentProvenance(undefined);
          setSelectionCoords(undefined);
          setAddCommentModalOpen(false);
          setShowComments(true);
        }}
        onClose={() => {
          setCommentProvenance(undefined);
          setSelectionCoords(undefined);
          setAddCommentModalOpen(false);
        }}
        provenance={commentProvenance}
        models={models}
        task={task}
      />
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
      {task && results && (
        <div>
          <TaskTile
            task={task}
            results={results}
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
          />
        </div>
      )}
      {task && models && results && (
        <div className={classes.taskContainer}>
          {hasAnyComments && showComments && (
            <div className={classes.commentsContainer}>
              <ViewComments
                taskComments={task.comments}
                resultComments={resultComments}
                onUpdateTaskComments={(updated) => {
                  updateTask(taskId, { comments: updated });
                }}
                onUpdateResultComments={(modelId, updated) => {
                  updateResult(taskId, modelId, { comments: updated });
                }}
                models={models}
              />
            </div>
          )}
          {/* Capture mouseup coords so the floating button can be positioned */}
          <div
            className={classes.taskViewWrapper}
            onMouseUp={(e) =>
              setSelectionCoords({ x: e.clientX, y: e.clientY })
            }
          >
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
          </div>
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
              <AddComment size={20} />
            </Tooltip>
          </div>
          {/* Floating contextual button — appears near cursor after text selection */}
          <div data-selection-comment-btn>
            <SelectionCommentButton
              provenance={commentProvenance}
              coords={selectionCoords}
              onOpen={() => {
                setSelectionCoords(undefined);
                setAddCommentModalOpen(true);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
