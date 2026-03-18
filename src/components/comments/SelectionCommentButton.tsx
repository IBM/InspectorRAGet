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

import { AddComment } from '@carbon/icons-react';

import { TaskCommentProvenance } from '@/src/types';
import classes from './SelectionCommentButton.module.scss';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  provenance: TaskCommentProvenance | undefined;
  coords: { x: number; y: number } | undefined;
  onOpen: () => void;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================

// Ephemeral floating button that appears near the cursor after text is selected.
// Only renders when both provenance (text was selected) and coords are set.
// Uses position:fixed so clientX/clientY map directly to viewport coordinates.
export default function SelectionCommentButton({
  provenance,
  coords,
  onOpen,
}: Props) {
  if (!provenance || !coords) return null;

  return (
    <button
      className={classes.selectionCommentBtn}
      style={{ left: coords.x + 8, top: coords.y - 36 }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label="Add comment for selected text"
      title="Add comment for selected text"
    >
      <AddComment size={16} />
    </button>
  );
}
