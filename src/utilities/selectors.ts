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

/**
 * Extract user selected text using document APIs
 * @returns
 */
export function extractMouseSelection(): [string, number[]] {
  var text = '';
  var offsets = [-1, -1];
  const selection = window.getSelection() || document.getSelection();

  if (selection && selection.type === 'Range') {
    // Extract text
    text = selection.toString();

    // Extract offsets
    const anchorOffset = selection.anchorOffset;
    const focusOffset = selection.focusOffset;
    offsets =
      anchorOffset <= focusOffset
        ? [anchorOffset, focusOffset]
        : [focusOffset, anchorOffset];
  }
  return [text, offsets];
}
