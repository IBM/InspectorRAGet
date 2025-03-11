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

import { createContext, useContext, useState, useRef } from 'react';
import { ToastNotification } from '@carbon/react';

import { Notification as NotificationType } from '@/src/types';

import styles from './Notification.module.scss';

type NotificationContextType = {
  createNotification(notification: NotificationType, timeout?: number): void;
};

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
);

const NotificationComponent = ({
  title,
  subtitle,
  kind,
  caption,
}: NotificationType) => (
  <ToastNotification
    hideCloseButton={true}
    className={styles.notification}
    closeOnEscape={false}
    title={title}
    kind={kind}
    subtitle={subtitle}
    caption={caption}
  />
);

export const NotificationProvider = ({ children }: { children: any }) => {
  const [notification, setNotification] = useState<
    NotificationType | undefined
  >();
  const timeoutId = useRef<NodeJS.Timeout | undefined>();

  const createNotification = (
    notification: NotificationType,
    timeout?: number,
  ) => {
    if (timeoutId.current) {
      clearTimeout(timeoutId.current);
    }
    setNotification(notification);
    timeoutId.current = setTimeout(
      () => {
        setNotification(undefined);
      },
      timeout ? timeout : 5000,
    );
  };

  return (
    <NotificationContext.Provider value={{ createNotification }}>
      {children}
      {notification && <NotificationComponent {...notification} />}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      'useNotification must be used within a NotificationProvider',
    );
  }
  return context;
};
