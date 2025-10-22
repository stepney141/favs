import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export async function* extractTextFromPDF(pdfData: Uint8Array): AsyncGenerator<string> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({ includeMarkedContent: false });
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join("\n");
    yield text;
  }
}
