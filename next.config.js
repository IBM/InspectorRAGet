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

const path = require('path');

const cspMap = {
  'base-uri': ["'none'"],
  'font-src': ["'self'", 'data:', "'unsafe-inline'"],
  'form-action': ["'self'"],
  'frame-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'blob:', 'www.ibm.com/'],
  'media-src': ["'self'", 'blob:', 'www.ibm.com/'],
  'object-src': ["'none'"],
  'style-src': ["'self'", "'unsafe-inline'", 'www.ibm.com/common/'],
};

const getCSPString = (cspMap) =>
  Object.entries(cspMap)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');

const headers = [
  {
    key: 'Content-Security-Policy',
    value: getCSPString(cspMap),
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-XSS-Protection',
    value: '1',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
];

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  output: 'standalone',
  sassOptions: {
    includePaths: [path.join(__dirname, 'styles')],
  },

  async headers() {
    return [
      // Default headers for all pages.
      { source: '/', headers },
      { source: '/:path*', headers },
    ];
  },
};

module.exports = nextConfig;
