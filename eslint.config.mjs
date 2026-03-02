import nextConfig from 'eslint-config-next/core-web-vitals';
import prettierConfig from 'eslint-config-prettier';

export default [
  ...nextConfig,
  prettierConfig,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
    },
  },
];
