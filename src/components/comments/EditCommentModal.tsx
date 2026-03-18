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

import { useState, useMemo } from 'react';
import { Modal, TextArea, TextInput, Tag } from '@carbon/react';

import { Model, TaskComment } from '@/src/types';
import { provenanceTag } from '@/src/components/comments/provenanceTag';
import classes from './AddCommentModal.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  comment: TaskComment;
  onSubmit: (updated: TaskComment) => void;
  onClose: () => void;
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
  // Pre-populate from the existing comment so editing author alone enables Save.
  const [commentText, setCommentText] = useState<string>(comment.comment);
  const [author, setAuthor] = useState<string>(comment.author);

  const {
    primary: [tag, tagType],
    detail,
  } = useMemo(
    () => provenanceTag(comment.provenance, models),
    [comment.provenance, models],
  );

  // Enable Save when either text or author changed, as long as neither is empty.
  const unchanged =
    commentText === comment.comment && author === comment.author;

  return (
    <Modal
      open={open}
      modalHeading="Edit comment"
      modalLabel="Comments"
      primaryButtonText="Save"
      secondaryButtonText="Cancel"
      onRequestSubmit={() => {
        onSubmit({
          ...comment,
          comment: commentText,
          author,
          updated: Date.now(),
        });
      }}
      onRequestClose={() => {
        onClose();
      }}
      primaryButtonDisabled={unchanged || commentText === '' || author === ''}
    >
      <div className={classes.commentProvenance}>
        <span className={classes.label}>Provenance</span>
        <div className={classes.provenanceTags}>
          <Tag type={tagType}>{tag}</Tag>
          {detail && (
            <>
              <Tag type="teal">{detail[0]}</Tag>
              <Tag type="cool-gray">{detail[1]}</Tag>
            </>
          )}
        </div>
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
        value={author}
        invalid={author === ''}
        invalidText={'author cannot be empty'}
        onChange={(event) => {
          setAuthor(event.target.value);
        }}
      />

      {/* Read-only finding display — editing findings is out of scope */}
      {comment.finding && (
        <div
          className={classes.commentProvenance}
          style={{ marginTop: '1rem' }}
        >
          <span className={classes.label}>Structured finding</span>
          <Tag type="teal" size="sm">
            {comment.finding.type}
          </Tag>
        </div>
      )}
    </Modal>
  );
}
