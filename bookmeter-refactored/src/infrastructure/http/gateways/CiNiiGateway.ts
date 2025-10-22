import type { SingleBookGateway } from "@/application/services/BiblioInfoAggregator";
import type { Book, BookMode } from "@/domain/entities/Book";
import type { HttpClient } from "@/infrastructure/http/HttpClient";
import type { Logger } from "@/shared/logging/Logger";

import { CINII_TARGETS, REGEX } from "@/domain/constants/BiblioConstants";
import { isAsin } from "@/domain/services/IsbnService";
import { sleep } from "@/shared/utils/Delay";
import { getRedirectedUrl } from "@/shared/utils/Network";

const CINII_ENDPOINT = "https://ci.nii.ac.jp/books/opensearch/search";

type CiniiItem = {
  "@id"?: string;
  "dc:creator"?: string;
  "dc:title"?: string;
  "dc:publisher"?: string;
  "dc:pubDate"?: string;
};

type CiniiGraph =
  | {
      "@type": string;
      "opensearch:totalResults": string;
    }
  | {
      "@type": string;
      items: CiniiItem[];
    };

type CiniiResponse = {
  "@graph"?: CiniiGraph[];
};

export class CiNiiGateway implements SingleBookGateway {
  constructor(private readonly http: HttpClient, private readonly appId: string, private readonly logger: Logger) {}

  async enrich(book: Book, _mode: BookMode): Promise<Book> {
    const identifier = book.isbnOrAsin;
    if (!identifier || isAsin(identifier)) {
      return book;
    }

    let current = { ...book };

    for (const library of CINII_TARGETS) {
      try {
        const query = `isbn=${encodeURIComponent(identifier)}`;
        const url = `${CINII_ENDPOINT}?${query}&kid=${library.ciniiKid}&format=json&appid=${this.appId}`;
        const response = await this.http.get<CiniiResponse>(url);
        const graph = response.data["@graph"]?.[0];

        if (graph && "items" in graph && Array.isArray(graph.items) && graph.items.length > 0) {
          const item = graph.items[0];
          current = this.applyCiniiHit(current, library.tag, library.opac, item);
          continue;
        }

        const fallbackUrl = `${library.opac}/opac/opac_openurl?isbn=${encodeURIComponent(identifier)}`;
        const redirected = await getRedirectedUrl(fallbackUrl);
        await sleep(1000);
        if (redirected && redirected.includes("bibid")) {
          current = this.applyOwning(current, library.tag, fallbackUrl);
        } else {
          current = this.applyMissing(current, library.tag);
        }
      } catch (error) {
        this.logger.error(`CiNii API error for library=${library.tag}`, error);
        current = this.applyError(current, library.tag);
      }
    }

    return current;
  }

  private applyCiniiHit(book: Book, tag: string, opac: string, item: CiniiItem): Book {
    const ncidUrl = item["@id"] ?? "";
    const ncid = ncidUrl.match(REGEX.ncidInCiniiUrl)?.[0];
    const existingOpac = tag === "sophia" ? book.sophiaOpac : book.utokyoOpac;
    const opacUrl = ncid ? `${opac}/opac/opac_openurl?ncid=${ncid}` : existingOpac;

    const updated: Book = {
      ...book,
      title: book.title || item["dc:title"] || "",
      author: book.author || item["dc:creator"] || "",
      publisher: book.publisher || item["dc:publisher"] || "",
      publishedDate: book.publishedDate || item["dc:pubDate"] || ""
    };

    return this.applyOwning(updated, tag, opacUrl ?? "");
  }

  private applyOwning(book: Book, tag: string, opacUrl: string): Book {
    if (tag === "sophia") {
      return { ...book, existInSophia: "Yes", sophiaOpac: opacUrl };
    }
    if (tag === "utokyo") {
      return { ...book, existInUTokyo: "Yes", utokyoOpac: opacUrl };
    }
    return book;
  }

  private applyMissing(book: Book, tag: string): Book {
    if (tag === "sophia") {
      return { ...book, existInSophia: "No" };
    }
    if (tag === "utokyo") {
      return { ...book, existInUTokyo: "No" };
    }
    return book;
  }

  private applyError(book: Book, tag: string): Book {
    if (tag === "sophia") {
      return { ...book, existInSophia: "Error" };
    }
    if (tag === "utokyo") {
      return { ...book, existInUTokyo: "Error" };
    }
    return book;
  }
}
