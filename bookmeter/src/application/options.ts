import type { OutputFilePath } from "../domain/types";

export type MainFuncOption = {
  mode: "wish" | "stacked";
  userId?: string;
  doLogin?: boolean;
  outputFilePath?: OutputFilePath | null;
  noRemoteCheck?: boolean;
  skipBookListComparison?: boolean;
  skipFetchingBiblioInfo?: boolean;
};
