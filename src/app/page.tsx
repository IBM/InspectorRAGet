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

import Home from '@/src/views/home/Home';

export default async function Page() {
  return (
    <Home
      page={{
        greeting: null,
        title: 'Welcome to InspectorRAGet',
        subtitle:
          'An introspection platform for evaluating LLM-based systems — benchmark performance, inspect individual results, and characterize your dataset.',
        subtitleLink: null,
        cards: [
          {
            title: 'Visualize',
            text: 'Upload your evaluation data and explore results across models, metrics, and tasks.',
            features: [
              'Aggregate performance breakdowns',
              'Per-instance inspection',
              'Multi-metric comparison',
              'Annotator qualification',
            ],
            href: '/visualize',
            actionText: 'Try it out',
            tag: null,
            icon: 'CHART_MULTITYPE',
            openInNewTab: false,
          },
          {
            title: 'Examples',
            text: 'Browse pre-loaded datasets to see what InspectorRAGet can surface before uploading your own data.',
            features: [
              'RAG evaluation',
              'Text generation',
              'Tool calling',
              'Agentic traces',
            ],
            href: '/examples',
            actionText: 'Explore',
            tag: null,
            icon: 'MICROSCOPE',
            openInNewTab: false,
          },
        ],
      }}
    />
  );
}
