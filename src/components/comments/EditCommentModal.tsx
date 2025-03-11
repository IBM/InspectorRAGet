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

import { useState, useMemo } from 'react';
import { Modal, TextArea, TextInput, Tag } from '@carbon/react';

import { Model, TaskComment } from '@/src/types';
import classes from './AddCommentModal.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  comment: TaskComment;
  onSubmit: Function;
  onClose: Function;
  open: boolean;
  models: Map<string, Model> | undefined;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function EditCommentModal({
  comment,
  onSubmit,
  onClose,
  open = false,
  models,
}: Props) {
  const [commentText, setCommentText] = useState<string>(comment.comment);
  const [author, setAuthor] = useState<string>('');
  const [tag, tagType] = useMemo(() => {
    if (comment.provenance) {
      if (comment.provenance.component.includes('input')) {
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
    <Modal
      open={open}
      modalHeading="Edit comment"
      modalLabel="Comments"
      primaryButtonText="Save"
      secondaryButtonText="Cancel"
      onRequestSubmit={() => {
        onSubmit({ ...comment, comment: commentText, author: author });
      }}
      onRequestClose={() => {
        onClose();
      }}
      primaryButtonDisabled={commentText === comment.comment || author === ''}
    >
      <div className={classes.commentProvenance}>
        <span className={classes.label}>Provenance</span>
        <Tag className={classes.commentProvenanceTag} type={tagType}>
          {tag}
        </Tag>
      </div>

      <TextArea
        className={classes.commentBox}
        labelText="Comment"
        rows={4}
        id="comment-area"
        value={commentText}
        invalid={commentText === ''}
        invalidText={'comment cannot be empty'}
        onChange={(event) => {
          setCommentText(event.target.value);
        }}
      />

      {tag !== 'Generic' && comment.provenance?.text && (
        <div className={classes.reference}>
          <div>
            <span className={'cds--label'}>Reference</span>
          </div>
          <p>{comment.provenance?.text}</p>
        </div>
      )}

      <TextInput
        id="author-input"
        type="text"
        labelText="Author"
        defaultValue={author}
        invalid={author === ''}
        invalidText={'author cannot be empty'}
        onChange={(event) => {
          setAuthor(event.target.value);
        }}
      />
    </Modal>
  );
}
