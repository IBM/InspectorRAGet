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

import cx from 'classnames';
import { Link as CarbonLink, Tag } from '@carbon/react';
import { ArrowRight, Launch } from '@carbon/icons-react';
import { ComponentType, memo, ReactNode, useId } from 'react';
import Link from 'next/link';
import classes from './Card.module.scss';

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

const getHeading = (level: HeadingLevel) => `h${level}` as const;

export interface CardProps {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  href?: string | null;
  actionText?: ReactNode;
  text?: ReactNode;
  content?: ReactNode;
  headingLevel?: HeadingLevel;
  tag?: string | null;
  openInNewTab: boolean;
  disabled?: boolean;
}

function Card({
  icon: Icon,
  title,
  text,
  href,
  actionText,
  content,
  headingLevel = 2,
  tag,
  openInNewTab,
  disabled,
}: CardProps) {
  const id = useId();
  const Heading = getHeading(headingLevel);
  return (
    <section className={cx(classes.root, disabled && classes.disabled)}>
      {href && actionText && (
        <Link
          href={disabled ? 'javascript:void(0)' : href}
          legacyBehavior
          passHref
        >
          <CarbonLink
            className={classes.link}
            renderIcon={openInNewTab ? Launch : ArrowRight}
            target={openInNewTab ? '_blank' : undefined}
            disabled={disabled}
          >
            {actionText}
          </CarbonLink>
        </Link>
      )}
      <div className={classes.body}>
        <Icon className={classes.icon} size={24} />
        <Heading className={classes.heading}>
          {title}
          {tag && (
            <Tag as="span" size="sm" id={`${id}-tag`} type="high-contrast">
              {tag}
            </Tag>
          )}
        </Heading>
        {!!text && <p className={classes.text}>{text}</p>}
        {!!content && <div className={classes.content}>{content}</div>}
      </div>
    </section>
  );
}

export default memo(Card);
