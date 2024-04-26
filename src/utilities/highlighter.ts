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

import { StringMatchObject } from '@/src/types';

export function extractMatchesInTarget(
  matches: StringMatchObject[],
): { start: number; end: number; text: string }[] {
  // Step 1: Sort matches based on starting index of matches in the target
  const orderedMatches: StringMatchObject[] = Array.from(matches).toSorted(
    function (a: StringMatchObject, b: StringMatchObject) {
      return a.matchesInTarget[0].start - b.matchesInTarget[0].start;
    },
  );

  // Step 2: Return first match from target
  return orderedMatches.map((entry: StringMatchObject) => {
    return {
      start: entry.matchesInTarget[0].start,
      end: entry.matchesInTarget[0].end,
      text: entry.text,
    };
  });
}

/**
 * Add span tags in the text to create highlighting effect
 * @param text
 * @param matches
 * @param type
 * @returns
 */
export function mark(
  text: string,
  matches: StringMatchObject[],
  type: 'source' | 'target',
) {
  let markedText = '';
  let curTextPos = 0;
  let curMatchListIdx = 0;

  const matchesToMark =
    type === 'source' ? matches : extractMatchesInTarget(matches);

  while (curTextPos < text.length && curMatchListIdx < matches.length) {
    let currentMatch = matchesToMark[curMatchListIdx];
    let currentMatchStart = currentMatch.start;
    let currentMatchEnd = currentMatch.end;

    if (curTextPos < currentMatchStart) {
      if (type == 'source') {
        markedText += `<span>${text.substring(
          curTextPos,
          currentMatchStart,
        )}</span>`;
      } else if (type == 'target') {
        markedText += text.substring(curTextPos, currentMatchStart);
      }
      curTextPos = currentMatchStart - 1;
    }

    if (currentMatchStart >= curTextPos) {
      // Add info on the context match mapping
      if (type == 'source') {
        // @ts-expect-error
        const contextMatchStart = currentMatch.matchesInTarget[0].start;
        // @ts-expect-error
        const contextMatchEnd = currentMatch.matchesInTarget[0].end;

        markedText += `<span class='copiedText' context-match-id='${contextMatchStart}-${contextMatchEnd}'>${text.substring(
          currentMatchStart,
          currentMatchEnd,
        )}</span>`;
      } else if (type == 'target') {
        markedText += `<span class='copiedText' id='${currentMatchStart}-${currentMatchEnd}'>${text.substring(
          currentMatchStart,
          currentMatchEnd,
        )}</span>`;
      }
      curTextPos = currentMatchEnd;
    }

    curMatchListIdx++;
  }

  if (curTextPos < text.length) {
    if (type == 'source') {
      markedText += `<span>${text.substring(curTextPos, text.length)}</span>`;
    } else if (type == 'target') {
      markedText += text.substring(curTextPos, text.length);
    }
  }

  return markedText;
}
