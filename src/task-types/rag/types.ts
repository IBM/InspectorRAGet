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

import type { TraceEvent, ToolCallRecord } from '@/src/types';

// A retry attempt the model made before arriving at the final output.
// Captures intermediate content/tool_calls and any error that triggered the retry.
export interface MessageRetry {
  content?: string;
  tool_calls?: ToolCallRecord[];
  error?: string;
  trace?: TraceEvent[];
}

export interface Message {
  role: 'system' | 'developer' | 'user' | 'tool' | 'assistant';
  utterance_id?: string;
  content?: any;
  name?: string;
  timestamp?: number;
  // tool_calls is declared here so that output[0].tool_calls is accessible without
  // casting when iterating over Message[] output. The concrete type is ToolCallRecord[].
  tool_calls?: ToolCallRecord[];
  // Per-message execution trace. Optional — views degrade gracefully when absent.
  trace?: TraceEvent[];
  retries?: MessageRetry[];
  // Benchmark-supplied metadata. Keys are benchmark-specific; the UI renders
  // known keys (e.g. metadata.status) and ignores unknown ones.
  // Known keys: status — 'pass' | 'fail' | 'warn' (stamped by converters).
  metadata?: Record<string, unknown>;
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
