import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const adapter = path.join(root, 'packages/core-matrix-js');
const contract = path.join(root, 'packages/core/src');
const errors = [];

const walk = (dir, visit) => {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(file, visit);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      visit(file);
    }
  }
};

const imports = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  const found = [];
  const pattern = /(?:from\s*|import\s*)['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(text))) found.push(match[1]);
  return found;
};

walk(path.join(root, 'src'), (file) => {
  for (const specifier of imports(file)) {
    if (/^matrix-js-sdk\/lib\/crypto-api(?:\/|$)/.test(specifier)) {
      errors.push(
        `${path.relative(root, file)}: crypto-api только в core-matrix-js (${specifier})`
      );
    }
  }
});

walk(path.join(root, 'packages'), (file) => {
  if (!file.startsWith(adapter)) {
    for (const specifier of imports(file)) {
      if (specifier === 'matrix-js-sdk' || specifier.startsWith('matrix-js-sdk/')) {
        errors.push(`${path.relative(root, file)}: SDK вне core-matrix-js (${specifier})`);
      }
    }
  }
});

walk(contract, (file) => {
  for (const specifier of imports(file)) {
    if (specifier === 'matrix-js-sdk' || specifier.startsWith('matrix-js-sdk/')) {
      errors.push(`${path.relative(root, file)}: SDK в публичном контракте (${specifier})`);
    }
  }
});

if (errors.length > 0) {
  console.error('Core boundary check failed:\n' + errors.join('\n'));
  process.exit(1);
}

console.log('Core boundary check passed.');
