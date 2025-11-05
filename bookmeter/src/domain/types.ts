import type { ASIN, BookmeterUrl, ISBN10 } from "./book-id";
import type { Book } from "./entities/book";

/**
 * Domain-level aliases shared across layers. Centralizing these prevents circular imports.
 */
export type BookList = Map<BookmeterUrl, Book>;

export type { ASIN, Book, BookmeterUrl, ISBN10 };
