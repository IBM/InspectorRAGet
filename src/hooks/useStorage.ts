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

export default function useLocalStorage(): {
  getItem: (key: string) => any;
  setItem: (key: string, value: any) => boolean;
  removeItem: (key: string) => void;
} {
  const isBrowser: boolean = ((): boolean => typeof window !== 'undefined')();

  const getItem = (key: string): any => {
    if (isBrowser) {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : undefined;
    }
    return undefined;
  };

  const setItem = (key: string, value: any): boolean => {
    if (isBrowser) {
      try {
        // Step 2: Check if item already exists
        if (window.localStorage.getItem(key)) {
          window.localStorage.removeItem(key);
        }

        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        console.log(err);
        console.log(err instanceof DOMException);
        if (err instanceof DOMException) console.log(err.name);
        if (
          err instanceof DOMException &&
          // everything except Firefox
          (err.name === 'QuotaExceededError' ||
            // Firefox
            err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
        ) {
          console.log('clearing local storage');
          window.localStorage.clear();
          console.log(window.localStorage);
        }

        // Re-try adding again
        window.localStorage.setItem(key, JSON.stringify(value));
      }

      return true;
    }

    return false;
  };

  const removeItem = (key: string): void => {
    window.localStorage.removeItem(key);
  };

  return {
    getItem,
    setItem,
    removeItem,
  };
}
