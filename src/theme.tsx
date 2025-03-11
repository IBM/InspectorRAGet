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

'use client';

import { createContext, useState, useContext } from 'react';
import { Theme } from '@carbon/react';

export const ThemeContext = createContext<{
  theme: string;
  set: (theme: 'g10' | 'g90') => void;
}>({
  theme: 'g10',
  set(theme) {},
});

export function ThemeProvider({ children }: { children: any }) {
  const [theme, setTheme] = useState<'g10' | 'g90'>('g10');

  const set = (theme: 'g10' | 'g90') => {
    setTheme(theme);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: theme,
        set: set,
      }}
    >
      <Theme theme={theme}>{children}</Theme>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
