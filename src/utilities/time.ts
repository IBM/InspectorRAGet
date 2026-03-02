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

import endOfDay from 'date-fns/endOfDay';
import startOfYear from 'date-fns/startOfYear';
import sub from 'date-fns/sub';
import add from 'date-fns/add';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function calculateDuration(
  endTimestamp?: number,
  startTimestamp?: number,
) {
  if (!endTimestamp || !startTimestamp) {
    return [undefined, undefined, undefined, undefined];
  }

  let duration = endTimestamp - startTimestamp;

  var durationInDays = Math.floor(duration / 1000 / 60 / 60 / 24);
  duration -= durationInDays * 1000 * 60 * 60 * 24;

  var durationInHours = Math.floor(duration / 1000 / 60 / 60);
  duration -= durationInHours * 1000 * 60 * 60;

  var durationInMinutes = Math.floor(duration / 1000 / 60);
  duration -= durationInMinutes * 1000 * 60;

  var durationInSeconds = Math.floor(duration / 1000);

  return [
    durationInDays,
    durationInHours,
    durationInMinutes,
    durationInSeconds,
  ];
}

/**
 *
 * @param duration duration in seconds
 */
export function castDurationToString(duration: number) {
  var durationInDays = Math.floor(duration / 60 / 60 / 24);
  duration -= durationInDays * 60 * 60 * 24;

  var durationInHours = Math.floor(duration / 60 / 60);
  duration -= durationInHours * 60 * 60;

  var durationInMinutes = Math.floor(duration / 60);
  duration -= durationInMinutes * 60;

  var durationInSeconds = Math.floor(duration);

  return [
    durationInDays,
    durationInHours,
    durationInMinutes,
    durationInSeconds,
  ];
}

export const windows = {
  'Past 1 week': '1W',
  'Past 1 month': '1M',
  'Past 3 months': '3M',
  'Year to date': 'YTD',
  Custom: 'CUSTOM',
};

export const getDates = (window: string) => {
  const today = endOfDay(new Date());
  const dates: Date[] = [];

  if (window === windows['Past 1 week']) {
    for (let days = 7; days > 0; days--) {
      dates.push(sub(today, { days: days }));
    }
    dates.push(today);
  }

  if (window === windows['Past 1 month']) {
    dates.push(endOfDay(sub(today, { months: 1 })));

    // Fill in dates at 3-day intervals
    let nextDate = add(dates[dates.length - 1], { days: 3 });
    while (
      Math.floor(nextDate.getTime() / 1000) < Math.floor(today.getTime() / 1000)
    ) {
      dates.push(nextDate);
      nextDate = add(nextDate, { days: 3 });
    }

    dates.push(today);
  }

  if (window === windows['Past 3 months']) {
    dates.push(endOfDay(sub(today, { months: 3 })));

    // Fill in dates at 7-day intervals
    let nextDate = add(dates[dates.length - 1], { days: 7 });
    while (
      Math.floor(nextDate.getTime() / 1000) < Math.floor(today.getTime() / 1000)
    ) {
      dates.push(nextDate);
      nextDate = add(nextDate, { days: 7 });
    }

    dates.push(today);
  }

  if (window === windows['Year to date']) {
    dates.push(endOfDay(startOfYear(today)));

    // Fill in dates at 2-week intervals
    let nextDate = add(dates[dates.length - 1], { weeks: 2 });
    while (
      Math.floor(nextDate.getTime() / 1000) < Math.floor(today.getTime() / 1000)
    ) {
      dates.push(nextDate);
      nextDate = add(nextDate, { weeks: 2 });
    }

    dates.push(today);
  }

  if (window === windows['Custom']) {
  }

  return dates;
};
