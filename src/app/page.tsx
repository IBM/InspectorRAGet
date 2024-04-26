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

import Home from '@/src/views/home/Home';

export default async function Page() {
  return (
    <Home
      page={{
        greeting: 'Hi,',
        title: 'Welcome to InspectorRAGet',
        subtitle:
          'An introspection Platform for RAG Evaluation enabling performance benchmarking, a combined aggregate and in stance level analysis, a holistic view of results via a mix of metrics, annotator qualification, and dataset characterization. Our goal is to help accelerate the transition from idea to product.',
        subtitleLink: {
          content: 'Learn more',
          href: 'https://github.com/IBM/InspectorRAGet',
          openInNewTab: true,
        },
        cards: [
          {
            title: 'Visualize',
            text: 'Experience analytics capabilities.',
            href: '/visualize',
            actionText: 'Try it out',
            tag: null,
            icon: 'CHART_MULTITYPE',
            openInNewTab: false,
          },
          {
            title: 'Examples',
            text: 'See how analytics platform can help you identify issues with the model faster.',
            href: '/examples',
            actionText: 'Explore',
            tag: null,
            icon: 'MICROSCOPE',
            openInNewTab: false,
          },
          {
            title: 'Data collection cookbooks',
            text: 'A guide for collecting human & algorithmic evaluations.',
            href: '/cookbooks',
            actionText: 'Start cooking',
            tag: 'coming soon',
            icon: 'NOODLE_BOWL',
            openInNewTab: false,
            disabled: true,
          },
          {
            title: 'Documentation',
            text: 'Access developer resources',
            href: '/documentation',
            actionText: 'Read the docs',
            tag: 'coming soon',
            icon: 'BOOK',
            openInNewTab: false,
            disabled: true,
          },
        ],
      }}
    />
  );
}
