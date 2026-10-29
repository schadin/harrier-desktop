import { readFileSync } from 'fs';
import { resolve } from 'path';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

export default {
  base: process.env.VITE_BASE || '/',
  version: process.env.VITE_VERSION || pkg.version,
};
