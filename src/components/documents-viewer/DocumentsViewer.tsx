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

import { Button } from '@carbon/react';
import { ChevronLeft, ChevronRight, Link } from '@carbon/icons-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

import { ToolMessageDocument } from '@/src/types';

import classes from './DocumentsViewer.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  id: string;
  documents: ToolMessageDocument[];
  documentIndex: number;
  setDocumentIndex: Function;
  onSelection?: Function;
}

// ===================================================================================
//                               RENDER FUNCTIONS
// ===================================================================================

function DocumentViewer({
  id,
  document,
  onSelection,
}: {
  id: string;
  document: ToolMessageDocument;
  onSelection?: Function;
}) {
  return (
    <div className={classes.document}>
      <div className={classes.documentHeader}>
        <div className={classes.documentToolbar}>
          {document.url ? (
            <Button
              kind="ghost"
              renderIcon={Link}
              iconDescription="Click to open link"
              hasIconOnly
              tooltipAlignment="end"
              tooltipPosition="bottom"
              onClick={() => {
                window.open(document.url, '_blank');
              }}
            ></Button>
          ) : null}
        </div>
      </div>

      <article
        className={classes.documentContainer}
        onMouseDown={() => {
          if (onSelection) {
            const [segment, documentIdx] = id.split('__documents--');
            onSelection(
              `messages[${segment.split('message--').slice(-1)[0]}].documents[${documentIdx}].text`,
            );
          }
        }}
        onMouseUp={() => {
          if (onSelection) {
            const [segment, documentIdx] = id.split('__documents--');
            onSelection(
              `messages[${segment.split('message--').slice(-1)[0]}].documents[${documentIdx}].text`,
            );
          }
        }}
      >
        <div className={classes.markdown}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
          >
            {document.text}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  );
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function DocumentsViewer({
  id,
  documents,
  documentIndex,
  setDocumentIndex,
  onSelection,
}: Props) {
  // Step 1: Render
  if (isEmpty(documents)) {
    return null;
  } else {
    return (
      <div className={classes.documentsViewer}>
        {documents.length > 1 ? (
          <div className={classes.toolbar}>
            <Button
              id={'document--selector-prev'}
              kind="ghost"
              hasIconOnly
              renderIcon={ChevronLeft}
              iconDescription="Previous document"
              onClick={() => {
                if (documentIndex > 0) {
                  setDocumentIndex(documentIndex - 1);
                }
              }}
              disabled={documentIndex === 0}
            />
            <span className={classes.documentIndex}>
              {documentIndex + 1} / {documents.length}
            </span>
            <Button
              id={'document--selector-next'}
              kind="ghost"
              hasIconOnly
              renderIcon={ChevronRight}
              iconDescription="Next document"
              onClick={() => {
                if (documentIndex < documents.length - 1) {
                  setDocumentIndex(documentIndex + 1);
                }
              }}
              disabled={documentIndex === documents.length - 1}
            />
          </div>
        ) : null}
        <div className={classes.container}>
          <DocumentViewer
            id={`${id}--${documentIndex}`}
            document={documents[documentIndex]}
            onSelection={onSelection}
          />
        </div>
      </div>
    );
  }
}
