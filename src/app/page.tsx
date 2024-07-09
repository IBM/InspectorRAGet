import Home from '@/src/views/home/Home';

export default function Page() {
  const pageData = {
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
  };

  return <Home page={pageData} />;
}