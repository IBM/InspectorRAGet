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
function normalize(text: string) {
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
  var startIndex = offset;

  // Skip over non-alphanumeric characters
  while (startIndex < text.length && /\W/.test(text.charAt(startIndex))) {
    startIndex++;
  }

  return startIndex;
}

/**
 * Identify end of next token
 * @param text
 * @param offset starting offset in the text
 * @returns ending position index of next token
 */
function getNextTokenEnd(text: string, offset: number = 0): number {
  var endIndex = getNextTokenStart(text, offset);

  // Advance through alphanumeric characters until a word boundary
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
function match(
  query: string,
  text: string,
): { readonly start: number; readonly end: number }[] {
  const regex = createRegex(query);
  const matches: { readonly start: number; readonly end: number }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: regex.lastIndex,
    });
  }

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
  const normalizedSource = normalize(source).toLowerCase();
  const normalizedTarget = normalize(target).toLowerCase();
  const matches: StringMatchObject[] = [];

  let curStartPos = getNextTokenStart(normalizedSource, 0);

  // Walk through each token in the source, greedily extending matches into the target
  while (curStartPos < normalizedSource.length) {
    let curEndPos = curStartPos;
    let matchTokenLength = 0;
    let substringEndPos = curStartPos;

    // Advance past the minimum token threshold before checking for matches
    while (matchTokenLength < min_match_tokens - 1) {
      substringEndPos = getNextTokenEnd(normalizedSource, substringEndPos);
      matchTokenLength++;
    }

    // Greedily extend the substring while it still matches in the target
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
