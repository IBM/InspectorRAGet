import nextConfig from 'eslint-config-next/core-web-vitals';
import prettierConfig from 'eslint-config-prettier';
import headerPlugin from '@tony.ganchev/eslint-plugin-header';

export default [
  ...nextConfig,
  prettierConfig,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    plugins: {
      header: headerPlugin,
    },
    rules: {
      'header/header': [
        'error',
        {
          header: {
            commentType: 'block',
            lines: [
              '*',
              ' *',
              ' * Copyright 2023-present InspectorRAGet Team',
              ' *',
              ' * Licensed under the Apache License, Version 2.0 (the "License");',
              ' * you may not use this file except in compliance with the License.',
              ' * You may obtain a copy of the License at',
              ' *',
              ' *     http://www.apache.org/licenses/LICENSE-2.0',
              ' *',
              ' * Unless required by applicable law or agreed to in writing, software',
              ' * distributed under the License is distributed on an "AS IS" BASIS,',
              ' * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.',
              ' * See the License for the specific language governing permissions and',
              ' * limitations under the License.',
              ' *',
              ' *',
            ],
          },
        },
      ],
    },
  },
];
