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

import {
  TaskCommentProvenance,
  CommentFinding,
  Model,
  Task,
} from '@/src/types';
import CommentFindingEditor from '@/src/components/comments/CommentFindingEditor';
import { provenanceTag } from '@/src/components/comments/provenanceTag';
import classes from './AddCommentModal.module.scss';

interface Props {
  onSubmit: (comment: string, author: string, finding?: CommentFinding) => void;
  onClose: () => void;
  open: boolean;
  selectedText?: string;
  provenance: TaskCommentProvenance | undefined;
  models: Map<string, Model> | undefined;
  task?: Task;
}

export default function AddCommentModal({
  selectedText,
  onSubmit,
  onClose,
  open = false,
  provenance,
  models,
  task,
}: Props) {
  const [comment, setComment] = useState<string>('');
  const [author, setAuthor] = useState<string>('');
  const [finding, setFinding] = useState<CommentFinding | undefined>(undefined);

  const {
    primary: [tag, tagType],
    detail,
  } = useMemo(() => provenanceTag(provenance, models), [provenance, models]);

  function handleClose() {
    setComment('');
    setFinding(undefined);
    onClose();
  }

  function handleSubmit() {
    onSubmit(comment, author, finding ?? undefined);
    setComment('');
    setFinding(undefined);
  }

  return (
    <Modal
      open={open}
      modalHeading="Add a comment"
      modalLabel="Comments"
      primaryButtonText="Add"
      secondaryButtonText="Cancel"
      onRequestSubmit={handleSubmit}
      onRequestClose={handleClose}
      primaryButtonDisabled={comment === '' || author === ''}
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
        value={comment}
        invalid={comment === ''}
        invalidText={'comment cannot be empty'}
        onChange={(event) => {
          setComment(event.target.value);
        }}
      />

      {tag !== 'Generic' && (
        <div className={classes.reference}>
          <div>
            <span className={'cds--label'}>Reference</span>
          </div>
          <p>{selectedText}</p>
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

      <details className={classes.findingSection}>
        <summary>Add structured finding (optional)</summary>
        <CommentFindingEditor
          taskType={task?.taskType}
          tools={task?.tools}
          value={finding}
          onChange={setFinding}
        />
      </details>
    </Modal>
  );
}
