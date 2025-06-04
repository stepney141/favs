import type { ElementHandle, JSHandle } from "puppeteer";

import { ScrapingError } from "@/domain/models/errors";
import { err, ok, type Result } from "@/domain/models/result";

export const getNodeProperty = async <T>(eh: ElementHandle<Node>, prop: string): Promise<Result<T, ScrapingError>> => {
  const handle = (await eh.getProperty(prop)) as JSHandle<T>;
  const value = await handle.jsonValue();

  if (value === null || value === undefined) {
    const uriHandle = await eh.getProperty("baseURI");
    const uri = await uriHandle.jsonValue();
    return err(new ScrapingError(`Property ${prop} is null`, uri));
  }

  return ok(value);
};
