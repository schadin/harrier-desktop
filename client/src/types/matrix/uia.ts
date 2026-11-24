export type UIAFlow = {
  stages: string[];
};

export type UIAParams = Record<string, Record<string, unknown>>;

export type AuthData = {
  session?: string;
  completed?: string[];
  flows?: UIAFlow[];
  params?: UIAParams;
  errcode?: string;
  error?: string;
};

export type AuthDict = {
  type?: string;
  session?: string;
  [key: string]: unknown;
};
