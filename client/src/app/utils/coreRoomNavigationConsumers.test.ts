import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const parseSource = (url: URL) => {
  const source = readFileSync(url, 'utf8');
  return {
    source,
    sourceFile: ts.createSourceFile('consumer.tsx', source, ts.ScriptTarget.Latest, true),
  };
};

const findVariableInitializer = (sourceFile: ts.SourceFile, name: string): ts.Expression => {
  let initializer: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === name) {
      initializer = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!initializer) throw new Error(`Variable ${name} not found`);
  return initializer;
};

const findCalls = (sourceFile: ts.SourceFile, node: ts.Node): string[] => {
  const calls: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child)) calls.push(child.expression.getText(sourceFile));
    ts.forEachChild(child, visit);
  };
  visit(node);
  return calls;
};

describe('core room navigation consumers', () => {
  it('RoomCard delegates candidate-ordered alias resolution to the shared core helper', () => {
    const { source, sourceFile } = parseSource(
      new URL('../components/room-card/RoomCard.tsx', import.meta.url)
    );
    const initializer = findVariableInitializer(sourceFile, 'joinedRoomId');

    expect(findCalls(sourceFile, initializer)).toContain('getCanonicalAliasRoomId');
    expect(source).toContain("from '../../utils/coreRoomNavigation'");
    expect(initializer.getText(sourceFile)).not.toContain('stateEntry');
  });

  it('matrix mention rendering delegates non-tombstoned alias resolution to the shared core helper', () => {
    const { source, sourceFile } = parseSource(
      new URL('../plugins/react-custom-html-parser.tsx', import.meta.url)
    );
    const initializer = findVariableInitializer(sourceFile, 'getMentionRoom');

    expect(findCalls(sourceFile, initializer)).toContain('getCanonicalAliasRoomId');
    expect(source).toContain("from '../utils/coreRoomNavigation'");
    expect(initializer.getText(sourceFile)).not.toContain('rooms.all');
    expect(initializer.getText(sourceFile)).not.toContain('RoomTombstone');
  });
});
