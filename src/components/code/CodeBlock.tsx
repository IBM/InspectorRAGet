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

import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';

import { useTheme } from '@/src/theme';

import classes from './CodeBlock.module.scss';

// --- Language registration ---

// Register only the languages we ship out of the box. Unknown values fall through
// to plain monospace via Prism's no-grammar path. Adding a language later is one
// import + one registerLanguage call, so we keep this list small.
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('json', json);

// --- Types ---

interface Props {
  source: string;
  language?: string;
}

// --- Main component ---

// Renders source code with Prism syntax highlighting, themed to match the
// active Carbon theme (g10 → oneLight, g90 → oneDark).
export default function CodeBlock({ source, language }: Props) {
  const { theme } = useTheme();
  const style = theme === 'g90' ? oneDark : oneLight;

  return (
    <div className={classes.codeBlock}>
      <SyntaxHighlighter
        language={language}
        style={style}
        showLineNumbers
        wrapLongLines
        customStyle={{
          margin: 0,
          padding: '0.75rem',
          fontSize: '0.8125rem',
          background: 'transparent',
        }}
      >
        {source}
      </SyntaxHighlighter>
    </div>
  );
}
