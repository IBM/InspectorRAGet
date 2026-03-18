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

import { useState, memo, useMemo } from 'react';
import { Button, Tag } from '@carbon/react';
import { Edit, TrashCan } from '@carbon/icons-react';

import { TaskComment, Model } from '@/src/types';
import EditCommentModal from '@/src/components/comments/EditCommentModal';
import { provenanceTag } from '@/src/components/comments/provenanceTag';

import classes from './CommentViewer.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  taskComments?: TaskComment[];
  resultComments?: {
    modelId: string;
    modelName: string;
    comments: TaskComment[];
  }[];
  onUpdateTaskComments: (updated: TaskComment[]) => void;
  onUpdateResultComments: (modelId: string, updated: TaskComment[]) => void;
  models: Map<string, Model> | undefined;
}

// ===================================================================================
//                               RENDER FUNCTION
// ===================================================================================
function Comment({
  id,
  comment,
  onEdit,
  onDelete,
  models,
}: {
  id: string;
  comment: TaskComment;
  onEdit: (updated: TaskComment) => void;
  onDelete: () => void;
  models: Map<string, Model> | undefined;
}) {
  const [editing, setEditing] = useState<boolean>(false);

  const {
    primary: [tag, tagType],
    detail,
  } = useMemo(
    () => provenanceTag(comment.provenance, models),
    [comment.provenance, models],
  );

  return (
    <>
      <EditCommentModal
        comment={comment}
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={(updatedComment) => {
          onEdit(updatedComment);
          setEditing(false);
        }}
        models={models}
      />
      <div className={classes.comment}>
        <div className={classes.commentHeader}>
          <div className={classes.commentHeaderAuthor}>
            <span className={classes.label}>Author</span>
            <span>{comment.author}</span>
          </div>
          <div className={classes.commentHeaderProvenance}>
            <span className={classes.label}>Provenance</span>
            {/* Stack detail pills below the primary pill when in the narrow sidebar */}
            <div className={classes.provenanceTags}>
              <Tag type={tagType} size="sm">
                {tag}
              </Tag>
              {detail && (
                <>
                  <Tag type="teal" size="sm">
                    {detail[0]}
                  </Tag>
                  <Tag type="cool-gray" size="sm">
                    {detail[1]}
                  </Tag>
                </>
              )}
            </div>
          </div>

          <span className={classes.commentHeaderTimestamp}>
            <span className={classes.label}>Last updated</span>
            <span>{new Date(comment.updated).toLocaleDateString()}</span>
          </span>
        </div>

        <div className={classes.commentBody}>{comment.comment}</div>

        {comment.finding && (
          <div className={classes.commentFinding}>
            <Tag type="teal" size="sm">
              {comment.finding.type}
            </Tag>
          </div>
        )}

        <div className={classes.commentActions}>
          <Button
            id={`${id}-editBtn`}
            className={classes.commentBtn}
            kind={'ghost'}
            onClick={() => {
              setEditing(true);
            }}
          >
            <span>Edit</span>
            <Edit />
          </Button>
          <Button
            id={`${id}-deleteBtn`}
            className={classes.commentBtn}
            kind={'ghost'}
            onClick={onDelete}
          >
            <span>Delete</span>
            <TrashCan />
          </Button>
        </div>
      </div>
    </>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default memo(function ViewComments({
  taskComments,
  resultComments,
  onUpdateTaskComments,
  onUpdateResultComments,
  models,
}: Props) {
  return (
    <div className={classes.viewer}>
      <h4>Comments</h4>

      {taskComments && taskComments.length > 0 && (
        <section>
          <h5 className={classes.sectionHeading}>Task comments</h5>
          {taskComments.map((comment, commentIdx) => (
            <Comment
              key={`task-comment-${commentIdx}`}
              id={`task-comment-${commentIdx}`}
              comment={comment}
              onEdit={(updatedComment) =>
                onUpdateTaskComments(
                  taskComments.toSpliced(commentIdx, 1, updatedComment),
                )
              }
              onDelete={() =>
                onUpdateTaskComments(taskComments.toSpliced(commentIdx, 1))
              }
              models={models}
            />
          ))}
        </section>
      )}

      {resultComments?.map(({ modelId, modelName, comments }) =>
        comments.length > 0 ? (
          <section key={`result-comments-${modelId}`}>
            <h5 className={classes.sectionHeading}>Model: {modelName}</h5>
            {comments.map((comment, commentIdx) => (
              <Comment
                key={`result-${modelId}-comment-${commentIdx}`}
                id={`result-${modelId}-comment-${commentIdx}`}
                comment={comment}
                onEdit={(updatedComment) =>
                  onUpdateResultComments(
                    modelId,
                    comments.toSpliced(commentIdx, 1, updatedComment),
                  )
                }
                onDelete={() =>
                  onUpdateResultComments(
                    modelId,
                    comments.toSpliced(commentIdx, 1),
                  )
                }
                models={models}
              />
            ))}
          </section>
        ) : null,
      )}
    </div>
  );
});
