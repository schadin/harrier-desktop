/* eslint-disable import/no-extraneous-dependencies */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourceText = readFileSync(new URL('./useSpace.tsx', import.meta.url), 'utf8');
const sourceFile = ts.createSourceFile('useSpace.tsx', sourceText, ts.ScriptTarget.Latest, true);

const getRequiredSpaceStatements = (): readonly ts.Statement[] => {
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'useRequiredCoreSpace'
  );
  if (!declaration?.body) throw new Error('useRequiredCoreSpace declaration not found');
  return declaration.body.statements;
};

const isUseCoreSpaceCall = (statement: ts.Statement): boolean => {
  if (!ts.isVariableStatement(statement)) return false;
  return statement.declarationList.declarations.some((declaration) => {
    const { initializer } = declaration;
    return (
      initializer !== undefined &&
      ts.isCallExpression(initializer) &&
      initializer.expression.getText(sourceFile) === 'useCoreSpace'
    );
  });
};

const isThrowGuard = (statement: ts.Statement): boolean => {
  if (!ts.isIfStatement(statement)) return false;
  const containsThrow = (node: ts.Node): boolean =>
    ts.isThrowStatement(node) || node.getChildren(sourceFile).some(containsThrow);
  return containsThrow(statement);
};

describe('useRequiredCoreSpace hook order', () => {
  it('calls every nested hook before validating the provider ID', () => {
    const statements = getRequiredSpaceStatements();
    const hookCallIndex = statements.findIndex(isUseCoreSpaceCall);
    const guardIndex = statements.findIndex(isThrowGuard);

    expect(hookCallIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeGreaterThan(hookCallIndex);
  });
});
