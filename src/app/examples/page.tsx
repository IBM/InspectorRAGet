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

/* NextJS 14 Hack to avoid fetching data during build */
export const dynamic = 'force-dynamic';

import { TileData } from '@/src/types';
import { load } from '@/src/dataloader';
import ExamplesView from '@/src/views/examples/Examples';

export default async function Page() {
  const examples: TileData[] = await load();

  return <ExamplesView examples={examples} />;
}
