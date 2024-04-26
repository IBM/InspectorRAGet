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

const fs = require('fs');
const path = require('path');
const prependFile = require('prepend-file');

const license = `/*! For license information please see app.LICENSE.txt */
`;

const chunksPath = path.join(__dirname, '../.next/static/chunks/');
const cssPath = path.join(__dirname, '../.next/static/css');

function applyLicence(filePath) {
  prependFile(filePath, license);
}

function findAllFiles(dirPath) {
  const files = [];
  const searchFiles = (directoryPath) =>
    fs.readdirSync(directoryPath).forEach((file) => {
      const filePath = path.join(directoryPath, file);
      if (fs.statSync(filePath).isDirectory()) {
        searchFiles(filePath);
      } else {
        files.push(filePath);
      }
    });

  searchFiles(dirPath);

  return files;
}

[chunksPath, cssPath].forEach((folder) => {
  const files = findAllFiles(folder);
  files.forEach((file) => applyLicence(file));
});
