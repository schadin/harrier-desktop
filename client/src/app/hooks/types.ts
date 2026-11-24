import type { RequestTokenView } from '@harrier/core';

export type RequestEmailTokenResponse = {
  email: string;
  clientSecret: string;
  result: RequestTokenView;
};
export type RequestEmailTokenCallback = (
  email: string,
  clientSecret: string,
  nextLink?: string
) => Promise<RequestEmailTokenResponse>;
