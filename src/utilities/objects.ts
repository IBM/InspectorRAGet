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

import { camelCase, isPlainObject, isArray, isEmpty } from 'lodash';

export function camelCaseKeys(
  obj: { [key: string]: any },
  keys: string[] = [
    'task_id',
    'model_id',
    'model_response',
    'display_value',
    'numeric_value',
    'min_value',
    'max_value',
    'task_type',
    'num_tasks',
    'start_timestamp',
    'end_timestamp',
    'document_id',
    'display_name',
  ],
) {
  if (isArray(obj)) {
    return obj.map((v) => camelCaseKeys(v));
  } else if (isPlainObject(obj)) {
    return Object.keys(obj).reduce(
      (result, key) => ({
        ...result,
        ...(keys.includes(key)
          ? { [camelCase(key)]: camelCaseKeys(obj[key]) }
          : { [key]: camelCaseKeys(obj[key]) }),
      }),
      {},
    );
  }
  return obj;
}

function areArraysIntersecting(
  a: string | string[],
  b: string | string[],
): boolean {
  const arrayA: any[] = Array.isArray(a) ? a : [a];
  const arrayB: any[] = Array.isArray(b) ? b : [b];

  for (var i = 0; i < arrayA.length; i++) {
    if (arrayB.includes(arrayA[i])) {
      return true;
    }
  }
  return false;
}

// returns true if there exist a key:value pair that is the same for both objects
// does not account for nesting
// value of 'all' is always satisfied, unless the key does not appear in object b
// there is a match between missing value and an empty value or empty key
export function areObjectsIntersecting(
  a: { [key: string]: string | string[] },
  b: { [key: string]: string | string[] },
): boolean {
  var intersection: { [key: string]: boolean } = {};

  for (const [keyA, valuesA] of Object.entries(a)) {
    if (valuesA === 'all') {
      intersection[keyA] = true;
    } else {
      var isBempty: boolean =
        !b || !Object.keys(b).includes(keyA) || isEmpty(b[keyA]);

      if (!isEmpty(valuesA) && isBempty) {
        intersection[keyA] = false;
      } else {
        intersection[keyA] = isBempty
          ? false
          : areArraysIntersecting(valuesA, b[keyA]);
      }
    }
  }
  return Object.values(intersection).reduce((acc, ele) => acc && ele);
}

// ===================================================================================
//                               LEGACY FUNCTIONS
// ===================================================================================
// function areObjectsIntersecting(
//   a: { [key: string]: string | string[] },
//   b: { [key: string]: string | string[] },
// ): boolean {
//   var intersection: { [key: string]: boolean } = {};
//   for (const [keyA, valuesA] of Object.entries(a)) {
//     if (valuesA === 'all') {
//       intersection[keyA] = true;
//     } else {
//       var isBempty: boolean =
//         !b || !Object.keys(b).includes(keyA) || isEmpty(b[keyA]);
//       if (valuesA.includes(missingValue) && isBempty) {
//         intersection[keyA] = true;
//       } else {
//         intersection[keyA] = isBempty
//           ? false
//           : areArraysIntersecting(valuesA, b[keyA]);
//       }
//     }
//   }
//   return Object.values(intersection).reduce((acc, ele) => acc && ele);
// }

// function areArraysIntersecting(
//   a: string | string[],
//   b: string | string[],
// ): boolean {
//   const arrayA: any[] = Array.isArray(a) ? a : [a];
//   const arrayB: any[] = Array.isArray(b) ? b : [b];

//   for (var i = 0; i < arrayA.length; i++) {
//     if (arrayB.includes(arrayA[i])) {
//       return true;
//     }
//   }
//   return false;
// }

// ===================================================================================
