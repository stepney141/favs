import type { ACCOUNTS } from "./constants";

export type TargetServices = keyof typeof ACCOUNTS;
export type TargetUrls = (typeof ACCOUNTS)[TargetServices];
export type Watchlists = {
  ns: number;
  title: string;
}[];

export type LoginStatus = "PASS" | "FAIL" | "UI" | "REDIRECT" | "RESTART";

export type ApiTokenResponse = {
  batchcomplete: string;
  query: {
    tokens: { logintoken: string };
  };
};

export type ClientLoginResponse = {
  clientlogin: {
    status: LoginStatus;
    username: string;
  };
};

export type Pagination = `${number}|${string}` | undefined;

export type WatchlistrawResponse = {
  batchcomplete: string;
  limits: {
    watchlistraw: number;
  };
  continue?: {
    continue: string;
    wrcontinue: Pagination;
  };
  watchlistraw: Watchlists;
};
