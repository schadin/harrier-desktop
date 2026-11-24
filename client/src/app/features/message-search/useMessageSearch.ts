import type {
  MessageSearchContextView,
  MessageSearchEventView,
  MessageSearchParamsView,
  MessageSearchResultView,
} from '@harrier/core';
import { useCallback } from 'react';
import { useCore } from '../../hooks/useCore';

export type ResultItem = {
  rank: number;
  event: MessageSearchEventView;
  context: MessageSearchContextView;
};

export type ResultGroup = {
  roomId: string;
  items: ResultItem[];
};

export type SearchResult = {
  nextToken?: string;
  highlights: string[];
  groups: ResultGroup[];
};

export type MessageSearchParams = MessageSearchParamsView;

export const useMessageSearch = (params: MessageSearchParams) => {
  const core = useCore();

  return useCallback(
    async (nextBatch?: string): Promise<SearchResult> => {
      const result = await core.rooms.searchMessages(params, nextBatch);
      if (!result.ok) throw result.error;
      const { value }: { value: MessageSearchResultView } = result;
      return {
        ...(value.nextToken ? { nextToken: value.nextToken } : {}),
        highlights: [...value.highlights],
        groups: value.groups.map((group) => ({
          roomId: group.roomId,
          items: group.items.map((item) => ({ ...item })),
        })),
      };
    },
    [core, params]
  );
};
