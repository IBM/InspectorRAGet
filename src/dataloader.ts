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

import path from 'path';
import { promises as fs } from 'fs';

import { Data } from '@/src/types';
import { processData } from '@/src/processor';
import { camelCaseKeys } from '@/src/utilities/objects';

export async function load() {
  const examples: Data[] = [];

  //Find the absolute path of the data directory
  const dataDirectory = path.join(process.cwd(), 'data');
  //Read the json data files
  try {
    const files = await fs.readdir(dataDirectory);
    for (const file of files) {
      const fileContent = await fs.readFile(`${dataDirectory}/${file}`, 'utf8');
      const [data] = processData(camelCaseKeys(JSON.parse(fileContent)));
      if (data) {
        examples.push(data);
      }
    }
  } catch (err) {
    console.error(err);
  }
  return examples;
}
