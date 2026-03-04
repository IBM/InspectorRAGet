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

import type { ToolCallRecord } from '@/src/types';

export interface Message {
  role: 'system' | 'developer' | 'user' | 'tool' | 'assistant';
  utterance_id?: string;
  content?: any;
  name?: string;
  timestamp?: number;
}

export interface SystemMessage extends Message {
  role: 'system';
}

export interface DeveloperMessage extends Message {
  role: 'developer';
}

export interface UserMessage extends Message {
  role: 'user';
}

export interface ToolMessageDocument {
  text: string;
  url?: string;
  title?: string;
  score?: number;
}

export interface ToolMessage extends Message {
  role: 'tool';
  tool_call_id: string;
  type?: 'text' | 'documents' | 'json';
  content: string | object | ToolMessageDocument[];
}

export interface AssistantMessage extends Message {
  role: 'assistant';
  refusal?: string;
  tool_calls?: ToolCallRecord[];
}
