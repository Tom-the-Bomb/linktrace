import { createCn } from 'cn/engine';

import tables from './cn-tables';

// tables compiled from our sources and index.css's @theme (the cn plugin in vite.config.ts keeps
// them current), so tailwind-merge knows the custom type roles instead of reading text-label as a colour
export const cn = createCn(tables);
