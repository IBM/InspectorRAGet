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

import { StringMatchObject } from '@/src/types';

const crypto = require('crypto');

export function truncate(text: string, length: number): string {
  if (text.length > length) {
    return text.slice(0, length) + ' ...';
  }

  return text;
}

export function hash(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * Normalize text (e.g., characters used for quotes). Used to improve matching.
 * @param text
 * @returns
 */
function normalize(text) {
  var normalizedText = text;
  // normalize double and single quotes
  normalizedText = text.replace(/[“”]/g, '"');
  normalizedText = normalizedText.replace(/[‘’]/g, "'");

  return normalizedText;
}

/**
 * Helper functions to identify token boundaries
 * getNextTokenStart: Identifies start of next token
 * getNextTokenEnd: Identified end of next token
 */

/**
 * Identify start of next token
 * @param text
 * @param offset starting offset in the text
 * @returns starting position index of next token
 */
function getNextTokenStart(text: string, offset: number = 0): number {
  // Step 1: Set starting index to provided offset
  var startIndex = offset;

  // Step 2: Skip over non-alphanumeric characters at the start
  while (startIndex < text.length && /\W/.test(text.charAt(startIndex))) {
    startIndex++;
  }

  // Step 3: Return
  return startIndex;
}

/**
 * Identify end of next token
 * @param text
 * @param offset starting offset in the text
 * @returns ending position index of next token
 */
function getNextTokenEnd(text: string, offset: number = 0): number {
  // Step 1: Set end index to be starting index of next token
  var endIndex = getNextTokenStart(text, offset);

  // Step 2: Include alphanumeric characters until the first non-alphanumeric character is found
  while (endIndex < text.length && !/\W/.test(text.charAt(endIndex))) {
    endIndex++;
  }

  return endIndex;
}

/**
 * Create regular expression based on string
 * @param text regular expression string
 * @returns
 */
function createRegex(text: string): RegExp {
  // Escape regular expression characters
  const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(escapedText, 'g');
}

/**
 * Find matches in the text based on query using regular expression
 * @param query string to find
 * @param text
 * @returns
 */
function match(query: string, text: string) {
  // Step 1: Create regular expression
  const regex = createRegex(query);

  // Step 2: Find matches
  const matches: { readonly start: number; readonly end: number }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: regex.lastIndex,
    });
  }

  // Step 3: Return
  return matches;
}

/**
 * Find overlap based on matching tokens between source and target
 * @param source string from which tokens are used to find overlap
 * @param target string in which overlaps are found
 * @param min_match_tokens
 * @returns
 */
export function overlaps(
  source: string,
  target: string,
  min_match_tokens: number = 3,
) {
  // Step 1: Normalize source and target text
  const normalizedSource = normalize(source).toLowerCase();
  const normalizedTarget = normalize(target).toLowerCase();

  // Step 2: Define necessary variables
  const matches: StringMatchObject[] = [];

  // Step 3: Find matches
  // Step 3.a: Identify starting position for next token in the source and set current end position to same starting position
  let curStartPos = getNextTokenStart(normalizedSource, 0);

  // Step 3.b: Keep finding next starting position till all tokens in the source are seen
  while (curStartPos < normalizedSource.length) {
    let curEndPos = curStartPos;
    let matchTokenLength = 0;
    let substringEndPos = curStartPos;

    // Step 3.b.i: Identify next minimum match tokens
    while (matchTokenLength < min_match_tokens - 1) {
      substringEndPos = getNextTokenEnd(normalizedSource, substringEndPos);
      matchTokenLength++;
    }

    // Step 3.b.ii:
    do {
      // Update temporary end position
      substringEndPos = getNextTokenEnd(normalizedSource, substringEndPos);

      // Find matches for the source substring in the target
      var matchesInTarget = normalizedTarget.match(
        createRegex(normalizedSource.substring(curStartPos, substringEndPos)),
      );

      if (matchesInTarget != null) {
        curEndPos = substringEndPos;
      }
    } while (matchesInTarget != null && curEndPos < normalizedSource.length);

    if (curEndPos !== curStartPos) {
      const localMatches: { start: number; end: number }[] = match(
        normalizedSource.substring(curStartPos, curEndPos),
        normalizedTarget,
      );
      matches.push({
        start: curStartPos,
        end: curEndPos,
        text: normalizedSource.substring(curStartPos, curEndPos),
        matchesInTarget: localMatches,
        count: localMatches.length,
      });

      // Set current starting position to next token in the source past current ending position
      curStartPos = getNextTokenStart(normalizedSource, curEndPos);
    } else {
      // Set current starting position to next token in the source past current ending position
      curStartPos = getNextTokenStart(
        normalizedSource,
        getNextTokenEnd(normalizedSource, curEndPos),
      );
    }
  }

  return matches;
}
