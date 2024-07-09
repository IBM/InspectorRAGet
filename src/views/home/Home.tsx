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

import { memo, useEffect, useState } from 'react';
import Link from 'next/link';
import { Link as CarbonLink } from '@carbon/react';
import { ChartMultitype, Microscope, NoodleBowl, Book } from '@carbon/icons-react';

import { HomePageAttributes } from '@/src/types';
import Card from './Card';
import classes from './Home.module.scss';

interface Props {
  page: HomePageAttributes;
}

const ICONS = {
  CHART_MULTITYPE: ChartMultitype,
  MICROSCOPE: Microscope,
  NOODLE_BOWL: NoodleBowl,
  BOOK: Book,
};

const HomePage = ({ page }: Props) => {
  const [data, setData] = useState<{ message: string } | null>(null);

  useEffect(() => {
    fetch('/api/data')
      .then(response => response.json())
      .then(data => setData(data))
      .catch(error => console.error('Error fetching data:', error));
  }, []);

  return (
    <div className={classes.root}>
      <div className={classes.leadspaceWrapper}>
        <header className={classes.leadspace}>
          <p>{page.greeting}</p>
          <h1 className={classes.heading}>{page.title}</h1>
          <p>
            {page.subtitle}
            {page.subtitleLink != null && (
              <>
                {' '}
                <Link href={page.subtitleLink.href} passHref legacyBehavior>
                  <CarbonLink
                    inline
                    target={page.subtitleLink.openInNewTab ? '_blank' : undefined}
                  >
                    {page.subtitleLink.content}
                  </CarbonLink>
                </Link>
              </>
            )}
          </p>
          {data && (
            <div className={classes.message}>
              <p>Fetched Message: {data.message}</p>
            </div>
          )}
        </header>
      </div>
      <nav aria-label="main links" className={classes.cards}>
        <ul className={classes.cardsList}>
          {page.cards.map((props, index) => (
            <li key={index}>
              <Card {...{ ...props, icon: ICONS[props.icon] }} />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default memo(HomePage);