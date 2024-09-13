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

import { useEffect } from 'react';

/**
 * Detects when user clicks the back button and asks the user to reconfirm
 *
 *
 */
export function useBackButton(warningMessage?: string) {
  const BACK_BUTTON_MESSAGE = 'Going back will make you lose the current progress. Are you sure you want to go back?';

  const onBackButtonEvent = (e) => {
    const leaveThisPage = window.confirm(warningMessage? warningMessage: BACK_BUTTON_MESSAGE);
    if (leaveThisPage) {
      // Let user go back
      window.history.back();
    }
  };

  useEffect(() => {
    //@ts-ignore
    window.history.pushState(null, null, window.location.pathname); // Prevent going back
    window.addEventListener('popstate', onBackButtonEvent);

    return () => {
      window.removeEventListener('popstate', onBackButtonEvent);
    };
  }, []);

  return {

  };
}