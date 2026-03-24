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

'use client';

import { isEmpty } from 'lodash';
import { useMemo, useState } from 'react';
import { CodeSnippet, Search } from '@carbon/react';
import { ChevronDown, ChevronUp, ToolKit } from '@carbon/icons-react';

import { ToolDefinition } from '@/src/types';

import classes from './AvailableToolsPanel.module.scss';

// --- Components ---

function ToolDefinitionCard({ tool }: { tool: ToolDefinition }) {
  const [expanded, setExpanded] = useState(false);
  const hasContent =
    !!tool.description ||
    (!!tool.parameters?.properties && !isEmpty(tool.parameters.properties));

  return (
    <div className={classes.callCard}>
      <div
        className={`${classes.callCardHeader} ${hasContent ? classes.callCardHeaderClickable : ''}`}
        onClick={hasContent ? () => setExpanded((prev) => !prev) : undefined}
        role={hasContent ? 'button' : undefined}
        aria-expanded={hasContent ? expanded : undefined}
      >
        <ToolKit size={16} />
        <span>{tool.name}</span>
        {hasContent && (
          <span className={classes.expandToggle} aria-hidden>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </div>
      {hasContent && expanded && (
        <div className={classes.toolDefinitionContent}>
          {tool.description && (
            <p className={classes.toolDescription}>{tool.description}</p>
          )}
          {tool.parameters?.properties &&
            !isEmpty(tool.parameters.properties) && (
              <ul className={classes.toolParamList}>
                {Object.entries(tool.parameters.properties).map(
                  ([paramName, paramDef]) => {
                    const isRequired =
                      tool.parameters?.required?.includes(paramName);
                    return (
                      <li key={paramName}>
                        <strong>{paramName}</strong>
                        {paramDef.type ? ` (${paramDef.type})` : ''}
                        {isRequired && (
                          <span className={classes.toolParamRequired}> *</span>
                        )}
                        {paramDef.description
                          ? ` — ${paramDef.description}`
                          : ''}
                        {paramDef.enum
                          ? ` [${(paramDef.enum as string[]).join(', ')}]`
                          : ''}
                      </li>
                    );
                  },
                )}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}

export default function AvailableToolsPanel({
  tools,
}: {
  tools: ToolDefinition[];
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return tools;
    const lower = query.toLowerCase();
    // Match on name or description — not parameter schemas, which are not human-searchable
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.description?.toLowerCase().includes(lower),
    );
  }, [tools, query]);

  return (
    <>
      <Search
        className={classes.toolsSearch}
        size="sm"
        labelText="Search tools"
        placeholder="Search by name or description"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className={classes.callList}>
        {filtered.map((tool) => (
          <ToolDefinitionCard key={tool.name} tool={tool} />
        ))}
        {filtered.length === 0 && query.trim() && (
          <p className={classes.noResults}>
            No tools match &ldquo;{query}&rdquo;
          </p>
        )}
      </div>
    </>
  );
}
