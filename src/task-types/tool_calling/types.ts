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

// OpenAI-compatible tool definition. parameters follows JSON Schema object format.
// Keeping this local to the tool_calling slice; re-exported from src/types.ts for
// consumers that import from the shared types barrel.
export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: {
    type: 'object';
    properties?: Record<
      string,
      {
        type?: string;
        description?: string;
        enum?: unknown[];
        [key: string]: unknown;
      }
    >;
    required?: string[];
    [key: string]: unknown;
  };
}
