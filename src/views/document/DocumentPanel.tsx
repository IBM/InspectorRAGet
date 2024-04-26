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

import cx from 'classnames';

import React from 'react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Button, Tag, Tooltip } from '@carbon/react';
import {
  ChevronLeft,
  ChevronRight,
  ImproveRelevance,
} from '@carbon/icons-react';

import { Document } from '@/src/types';

import classes from './DocumentPanel.module.scss';

function renderAnnotations(
  annotations:
    | { text: string; authors: string[]; color?: string }[]
    | undefined,
) {
  if (annotations === undefined) {
    return null;
  } else {
    return annotations.map((annotation, annotation_idx) => {
      return (
        <Tag
          key={`document-annotation-${annotation_idx}`}
          type={annotation.color ? annotation.color : 'gray'}
          className={classes.annotation}
        >
          <Tooltip
            align="right"
            label={`Authors: ${annotation.authors.join(', ')}`}
          >
            <div className={classes.annotationContent}>
              <ImproveRelevance />
              <span>{annotation.text}</span>
            </div>
          </Tooltip>
        </Tag>
      );
    });
  }
}

export default function DocumentPanel({
  documents,
  className,
  notify,
  onMouseDown,
  onMouseUp,
}: {
  documents: Document[];
  className?: string;
  onMouseDown: Function;
  onMouseUp: Function;
  notify?: Function;
}) {
  const [documentIndex, setDocumentIndex] = useState<number>(0);

  return (
    <>
      {documents.length > 1 ? (
        <div className={classes.documentNavigationContainer}>
          <Button
            id={'prev-document-btn'}
            kind={'ghost'}
            disabled={documentIndex === 0}
            renderIcon={ChevronLeft}
            hasIconOnly
            iconDescription={'Previous Document'}
            onClick={() => {
              setDocumentIndex(documentIndex - 1);

              // Notify document change, if notification hook is provided
              if (notify) {
                notify(documentIndex - 1);
              }
            }}
          />
          <span>{documentIndex + 1}</span>
          <Button
            id={'next-document-btn'}
            kind={'ghost'}
            disabled={documentIndex === documents.length - 1}
            renderIcon={ChevronRight}
            hasIconOnly
            iconDescription={'Next Document'}
            onClick={() => {
              setDocumentIndex(documentIndex + 1);

              // Notify document change, if notification hook is provided
              if (notify) {
                notify(documentIndex + 1);
              }
            }}
          />
        </div>
      ) : null}
      <div
        className={cx(className, classes.container)}
        onMouseDown={() => onMouseDown(`document_${documentIndex}::text`)}
        onMouseUp={() => onMouseUp(`document_${documentIndex}::text`)}
      >
        {documents[documentIndex].title ? (
          <h3>{documents[documentIndex].title}</h3>
        ) : null}
        {renderAnnotations(documents[documentIndex].annotations)}
        <article className={classes.documentContainer}>
          <ReactMarkdown
            className={classes.markdown}
            remarkPlugins={[remarkGfm]}
            // @ts-expect-error
            rehypePlugins={[rehypeRaw]}
          >
            {documents[documentIndex].text}
          </ReactMarkdown>
        </article>
      </div>
    </>
  );
}
