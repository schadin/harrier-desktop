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

const findQueryKeys = (sourceFile: ts.SourceFile): string[] => {
  const queryKeys: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'useQuery' &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const property = node.arguments[0].properties.find(
        (item) => ts.isPropertyAssignment(item) && item.name.getText(sourceFile) === 'queryKey'
      );
      if (property && ts.isPropertyAssignment(property)) {
        queryKeys.push(property.initializer.getText(sourceFile));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return queryKeys;
};

const jsxAttributes = (sourceFile: ts.SourceFile, tagName: string): string[] => {
  const attributes: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === tagName
    ) {
      node.attributes.properties.forEach((property) => {
        if (ts.isJsxAttribute(property)) attributes.push(property.name.getText(sourceFile));
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return attributes;
};

const roomSummaryLoader = () =>
  parseSource(new URL('../components/RoomSummaryLoader.tsx', import.meta.url));
const featured = () =>
  parseSource(new URL('../pages/client/explore/Featured.tsx', import.meta.url));
const joinBeforeNavigate = () =>
  parseSource(new URL('../features/join-before-navigate/JoinBeforeNavigate.tsx', import.meta.url));
const server = () => parseSource(new URL('../pages/client/explore/Server.tsx', import.meta.url));

describe('core room query consumers', () => {
  it('RoomSummaryLoader uses the core summary operation without a raw matrix client', () => {
    const { source, sourceFile } = roomSummaryLoader();
    expect(source).not.toContain('useMatrixClient');
    expect(source).not.toContain('getRoomSummary');
    expect(source).toContain('core.rooms.summary');
    expect(findQueryKeys(sourceFile)).toContain("[roomIdOrAlias, 'summary']");
  });

  it('Featured and JoinBeforeNavigate consume only camelCase summary fields', () => {
    [featured(), joinBeforeNavigate()].forEach(({ source }) => {
      expect(source).not.toContain('avatar_url');
      expect(source).not.toContain('num_joined_members');
      expect(source).not.toContain('room_type');
      expect(source).toContain('avatarMxc');
      expect(source).toContain('joinedMembers');
    });
    expect(joinBeforeNavigate().source).toContain('roomType');
  });

  it('JoinBeforeNavigate keeps via servers on RoomCard and not on the summary loader', () => {
    const { sourceFile } = joinBeforeNavigate();
    expect(jsxAttributes(sourceFile, 'RoomSummaryLoader')).not.toContain('viaServers');
    expect(jsxAttributes(sourceFile, 'RoomCard')).toContain('viaServers');
  });

  it('Server uses typed protocols and the core session identity with the federation gate', () => {
    const { source, sourceFile } = server();
    expect(source).not.toContain('useMatrixClient');
    expect(source).not.toContain('getThirdpartyProtocols');
    expect(source).not.toContain('getUserId');
    expect(source).toContain('core.rooms.thirdPartyProtocols');
    expect(source).toContain('useCoreSession');
    expect(source).toContain('getSessionUserId');
    expect(source).toContain('userServer === server');
    expect(findQueryKeys(sourceFile)).toContain("['thirdparty', 'protocols']");
  });
});
