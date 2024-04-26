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

import { useState, useMemo } from 'react';
import { Modal, TextArea, TextInput, Tag } from '@carbon/react';

import { TaskCommentProvenance, Model } from '@/src/types';
import classes from './AddCommentModal.module.scss';

interface Props {
  onSubmit: Function;
  onClose: Function;
  open: boolean;
  selectedText?: string;
  provenance: TaskCommentProvenance | undefined;
  models: Map<string, Model> | undefined;
}

export default function AddCommentModal({
  selectedText,
  onSubmit,
  onClose,
  open = false,
  provenance,
  models,
}: Props) {
  const [comment, setComment] = useState<string>('');
  const [author, setAuthor] = useState<string>('');
  const [tag, tagType] = useMemo(() => {
    if (provenance) {
      if (provenance.component.includes('input')) {
        return ['Input', 'purple'];
      } else if (provenance.component.includes('document_')) {
        return ['Contexts', 'cyan'];
      } else if (provenance.component.includes('::evaluation::response')) {
        const modelId = provenance.component.split('::')[0];
        return [`${models?.get(modelId)?.name || modelId}`, 'green'];
      } else {
        return ['Generic', 'gray'];
      }
    } else {
      return ['Generic', 'gray'];
    }
  }, [provenance, models]);

  return (
    <Modal
      open={open}
      modalHeading="Add a comment"
      modalLabel="Comments"
      primaryButtonText="Add"
      secondaryButtonText="Cancel"
      onRequestSubmit={() => {
        //Step 1: Clear comment & update default value for author
        setComment('');

        // Step 2: Register comment and close modal
        onSubmit(comment, author);
      }}
      onRequestClose={() => {
        //Step 1: Clear comment
        setComment('');

        // Step 2: Close modal
        onClose();
      }}
      primaryButtonDisabled={comment === '' || author === ''}
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
    </Modal>
  );
}
