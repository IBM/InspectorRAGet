/**
 *
 * Copyright 2023-2025 InspectorRAGet Team
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

import { Suspense } from 'react';
import HeaderView from '@/src/components/header/Header';
import Loading from '@/src/app/loading';
import { ThemeProvider } from '@/src/theme';
import { DataStoreProvider } from '@/src/store';
import { NotificationProvider } from '@/src/components/notification/Notification';

import '@/src/app/global.scss';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <NotificationProvider>
            <DataStoreProvider>
              <HeaderView />
              <Suspense fallback={<Loading />}>
                <main className="root">{children}</main>
              </Suspense>
            </DataStoreProvider>
          </NotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
