import { REGEX } from "@/domain/constants/BiblioConstants";

export const isIsbn10 = (value: string): boolean => REGEX.isbn10.test(value);

export const isIsbn13 = (value: string): boolean => REGEX.isbn13.test(value);

export const convertIsbn10To13 = (isbn10: string): string => {
  const src = `978${isbn10.slice(0, 9)}`;
  const sum = src
    .split("")
    .map((s) => Number(s))
    .reduce((prev, current, index) => prev + (index % 2 === 0 ? current : current * 3), 0);

  const remainder = 10 - (sum % 10);
  const checkDigit = remainder === 10 ? 0 : remainder;

  return `${src}${checkDigit}`;
};

export const isAsin = (value: string): boolean => {
  if (isIsbn10(value)) return false;
  return REGEX.amazonAsin.test(value);
};

export const matchAsin = (url: string): string | null => {
  const matched = url.match(REGEX.amazonAsin);
  return matched?.[0] ?? null;
};

export const routeIsbn10 = (isbn10: string): "Japan" | "Others" => (isbn10[0] === "4" ? "Japan" : "Others");
