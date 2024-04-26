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

'use client';

import Link from 'next/link';
import { React, memo } from 'react';
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  Theme,
} from '@carbon/react';

import {
  Home,
  DocumentExport,
  Debug,
  LogoGithub,
  Awake,
  Asleep,
} from '@carbon/icons-react';

import { useTheme } from '@/src/theme';
import { useDataStore } from '@/src/store';
import { useNotification } from '@/src/components/notification/Notification';
import { exportData } from '@/src/processor';

import classes from './Header.module.scss';

export default memo(function HeaderView() {
  const { theme, set } = useTheme();
  const { item, taskMap } = useDataStore();
  const { createNotification } = useNotification();

  return (
    <Header aria-label="InspectorRAGet">
      <Link className={classes.homeBtn} href="/">
        <Home height={'16px'} width={'16px'} />
      </Link>
      <HeaderName prefix="">InspectorRAGet</HeaderName>
      <HeaderGlobalBar>
        <HeaderGlobalAction
          aria-label={
            theme === 'white' ? 'Switch to dark mode' : 'Switch to light mode'
          }
          onClick={() => {
            theme === 'white' ? set('g100') : set('white');
          }}
        >
          {theme === 'white' ? <Asleep size={20} /> : <Awake size={20} />}
        </HeaderGlobalAction>
        <HeaderGlobalAction
          aria-label="Export"
          onClick={() => {
            const success = exportData(item, Array.from(taskMap.values()));
            if (success) {
              // Notify user about successfuly export
              createNotification({
                kind: 'success',
                title: 'Export successful.',
                subtitle: 'Please look into browser default save location.',
              });
            } else {
              // Notify user about invalid request
              createNotification({
                kind: 'error',
                title: 'Export unsuccessful.',
                subtitle: 'No visualized analytics data available to export.',
              });
            }
          }}
        >
          <DocumentExport size={20} />
        </HeaderGlobalAction>
        <HeaderGlobalAction
          aria-label="Report bug"
          onClick={() => {
            window.open(
              'https://github.com/IBM/InspectorRAGet/issues/new?assignees=&labels=&template=bug_report.md&title=',
              '_blank',
            );
          }}
        >
          <Debug size={20} />
        </HeaderGlobalAction>
        <HeaderGlobalAction
          aria-label="Github"
          onClick={() => {
            window.open('https://github.com/IBM/InspectorRAGet', '_blank');
          }}
        >
          <LogoGithub size={20} />
        </HeaderGlobalAction>
      </HeaderGlobalBar>
    </Header>
  );
});
