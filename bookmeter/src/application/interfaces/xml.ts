export type XmlParserOptions<T extends Record<string, unknown>> = T;

export interface XmlParser {
  parse<TConfig extends Record<string, unknown>, TResult>(
    xmlData: string,
    options?: Partial<XmlParserOptions<TConfig>>
  ): TResult;
}
