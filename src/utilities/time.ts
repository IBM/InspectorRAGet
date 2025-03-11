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
  // Step 1: Identify dates for x-axis
  const today = endOfDay(new Date());
  const dates: Date[] = [];

  // Step 1.a: If time window is 1-week long
  if (window === windows['Past 1 week']) {
    for (let days = 7; days > 0; days--) {
      dates.push(sub(today, { days: days }));
    }
    // Step 1.a.ii: Add today's date as final entry
    dates.push(today);
  }

  // Step 1.b: If time window is 1-month long
  if (window === windows['Past 1 month']) {
    // Step 1.b.i: Add 1 month before day as a 1'st date
    dates.push(endOfDay(sub(today, { months: 1 })));

    // Step 1.b.ii: Add dates every 3 days apart
    let nextDate = add(dates[dates.length - 1], { days: 3 });
    while (
      Math.floor(nextDate.getTime() / 1000) < Math.floor(today.getTime() / 1000)
    ) {
      dates.push(nextDate);
      nextDate = add(nextDate, { days: 3 });
    }

    // Step 1.b.iii: Add today's date as final entry
    dates.push(today);
  }

  // Step 1.c: If time window is 3-months long,
  if (window === windows['Past 3 months']) {
    // Step 1.c.i: Add 3 months before day as a 1'st date
    dates.push(endOfDay(sub(today, { months: 3 })));

    // Step 1.c.ii: Add dates every 7 days apart
    let nextDate = add(dates[dates.length - 1], { days: 7 });
    while (
      Math.floor(nextDate.getTime() / 1000) < Math.floor(today.getTime() / 1000)
    ) {
      dates.push(nextDate);
      nextDate = add(nextDate, { days: 7 });
    }

    // Step 1.c.iii: Add today's date as final entry
    dates.push(today);
  }

  // Step 1.d: If time window is year long,
  if (window === windows['Year to date']) {
    // Step 1.d.i: Add 1'st day of the year as a 1'st date
    dates.push(endOfDay(startOfYear(today)));

    // Step 1.d.ii: Add dates every 2 weeks apart
    let nextDate = add(dates[dates.length - 1], { weeks: 2 });
    while (
      Math.floor(nextDate.getTime() / 1000) < Math.floor(today.getTime() / 1000)
    ) {
      dates.push(nextDate);
      nextDate = add(nextDate, { weeks: 2 });
    }

    // Step 1.d.iii: Add today's date as final entry
    dates.push(today);
  }

  if (window === windows['Custom']) {
  }

  return dates;
};
