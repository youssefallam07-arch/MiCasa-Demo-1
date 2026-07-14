// Offline export: write docs/registry.xlsx from the live database.
//   npm run export:registry
// (The CENTCOM app's "⬇ Excel" button produces the same workbook on demand.)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeRegistryFile } from '../packages/centcom/src/registry-xlsx';

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, '../docs');
fs.mkdirSync(docs, { recursive: true });
const out = path.join(docs, 'registry.xlsx');
writeRegistryFile(out).then(() => console.log('Wrote ' + out)).catch((e) => { console.error(e); process.exit(1); });
