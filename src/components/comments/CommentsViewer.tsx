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

import { useState, memo, useMemo } from 'react';
import { Button, Tag } from '@carbon/react';
import { Edit, TrashCan } from '@carbon/icons-react';

import { TaskComment, Model } from '@/src/types';
import EditCommentModal from '@/src/components/comments/EditCommentModal';

import classes from './CommentViewer.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  comments: TaskComment[];
  onUpdate: Function;
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
  onEdit: Function;
  onDelete: Function;
  models: Map<string, Model> | undefined;
}) {
  const [editing, setEditing] = useState<boolean>(false);

  const [tag, tagType]: [string, string] = useMemo(() => {
    if (comment.provenance) {
      if (
        comment.provenance.component.includes('input') ||
        comment.provenance.component.includes('messages')
      ) {
        return ['Input', 'purple'];
      } else if (comment.provenance.component.includes('document_')) {
        return ['Contexts', 'cyan'];
      } else if (
        comment.provenance.component.includes('::evaluation::response')
      ) {
        const modelId = comment.provenance.component.split('::')[0];
        return [`${models?.get(modelId)?.name || modelId}`, 'green'];
      } else {
        return ['Generic', 'gray'];
      }
    } else {
      return ['Generic', 'gray'];
    }
  }, [comment.provenance, models]);

  return (
    <>
      <EditCommentModal
        comment={comment}
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={(updatedComment) => {
          // Step 1: Update comment
          onEdit(updatedComment);

          // Step 2: Close editing modal
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
            <Tag className={classes.commentTag} type={tagType}>
              {tag}
            </Tag>
          </div>

          <span className={classes.commentHeaderTimestamp}>
            <span className={classes.label}>Last updated</span>
            <span>{new Date(comment.updated).toLocaleDateString()}</span>
          </span>
        </div>

        <div className={classes.commentBody}>{comment.comment}</div>
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
  comments,
  onUpdate,
  models,
}: Props) {
  return (
    <div className={classes.viewer}>
      <h4>Comments</h4>
      {comments.map((comment, commentIdx) => {
        return (
          <Comment
            key={`comment-${commentIdx}`}
            id={`comment-${commentIdx}`}
            comment={comment}
            onEdit={(updatedComment) =>
              onUpdate(comments.toSpliced(commentIdx, 1, updatedComment))
            }
            onDelete={() => onUpdate(comments.toSpliced(commentIdx, 1))}
            models={models}
          />
        );
      })}
    </div>
  );
});
