import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const adapter = path.join(root, 'packages/core-matrix-js');
const contract = path.join(root, 'packages/core/src');
const errors = [];

const walk = (dir, visit) => {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(file, visit);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      visit(file);
    }
  });
};

const imports = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  const pattern = /(?:from\s*|import\s*)['"]([^'"]+)['"]/g;
  return Array.from(text.matchAll(pattern), (match) => match[1]);
};

const forbiddenLegacyIdentifiers = new Set(['EventTimelineSetHandlerMap']);

const legacyIdentifiers = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = [];
  const visit = (node) => {
    if (ts.isIdentifier(node) && forbiddenLegacyIdentifiers.has(node.text)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push({ identifier: node.text, line: line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

const checkLegacyIdentifiers = (file) => {
  legacyIdentifiers(file).forEach(({ identifier, line }) => {
    errors.push(`${path.relative(root, file)}: ${identifier} вне core-matrix-js (строка ${line})`);
  });
};

walk(path.join(root, 'src'), (file) => {
  imports(file).forEach((specifier) => {
    if (specifier === 'matrix-js-sdk' || specifier.startsWith('matrix-js-sdk/')) {
      errors.push(`${path.relative(root, file)}: SDK вне core-matrix-js (${specifier})`);
    }
  });
  checkLegacyIdentifiers(file);
});

walk(path.join(root, 'packages'), (file) => {
  if (!file.startsWith(`${adapter}${path.sep}`)) {
    imports(file).forEach((specifier) => {
      if (specifier === 'matrix-js-sdk' || specifier.startsWith('matrix-js-sdk/')) {
        errors.push(`${path.relative(root, file)}: SDK вне core-matrix-js (${specifier})`);
      }
    });
    checkLegacyIdentifiers(file);
  }
});

walk(contract, (file) => {
  imports(file).forEach((specifier) => {
    if (specifier === 'matrix-js-sdk' || specifier.startsWith('matrix-js-sdk/')) {
      errors.push(`${path.relative(root, file)}: SDK в публичном контракте (${specifier})`);
    }
  });
});

if (errors.length > 0) {
  process.stderr.write(`Core boundary check failed:\n${errors.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write('Core boundary check passed.\n');
