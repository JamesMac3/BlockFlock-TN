import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it, afterEach } from "vitest";
import { inspectWithPdfJs, PdfInspectionError, readPageTextContent, type PdfTextStreamPage } from "./output-validator";

/**
 * Narrowly scoped tests for the Safari/WebKit ReadableStream-async-iteration
 * compatibility fix (see output-validator.ts's own comments and
 * https://github.com/mozilla/pdf.js/issues/20973 /
 * https://webkit.org/blog/17862/webkit-features-for-safari-26-4/).
 *
 * readPageTextContent is tested directly against small fake pages first —
 * that is the actual code whose correctness this fix depends on — then
 * inspectWithPdfJs is exercised end-to-end against real, multi-page,
 * pdf-lib-generated PDFs (the same kind of fixture output-validator.test.ts
 * and the render pipeline's own tests already use) with
 * ReadableStream.prototype[Symbol.asyncIterator] deliberately removed, to
 * prove the real pipeline no longer depends on it.
 *
 * This environment has no real Safari/WebKit — see the task's own separate
 * WebKit/production-preview verification for what was and wasn't confirmed
 * there. Deleting Symbol.asyncIterator from ReadableStream.prototype here
 * simulates the specific missing capability the Mozilla issue and the
 * WebKit blog post describe (pre-Safari-26.4 lacked ReadableStream async
 * iteration), not a full emulation of Safari 26.6.1.
 */

function multiChunkFakePage(chunks: Array<Array<{ str: string }>>): PdfTextStreamPage {
  return {
    streamTextContent: () =>
      new ReadableStream({
        start(controller) {
          for (const items of chunks) controller.enqueue({ items, styles: {}, lang: null });
          controller.close();
        },
      }),
  } as unknown as PdfTextStreamPage;
}

describe("readPageTextContent: reads via getReader()/read(), not async iteration", () => {
  it("accumulates items across multiple stream chunks in order and joins them with a space", async () => {
    const page = multiChunkFakePage([
      [{ str: "Hello" }, { str: "there" }],
      [{ str: "General" }, { str: "Kenobi" }],
    ]);
    const text = await readPageTextContent(page);
    expect(text).toBe("Hello there General Kenobi");
  });

  it("releases the reader lock after a successful read — the stream can be read again", async () => {
    let capturedStream!: ReadableStream;
    const page: PdfTextStreamPage = {
      streamTextContent: () => {
        capturedStream = new ReadableStream({
          start(controller) {
            controller.enqueue({ items: [{ str: "ok" }], styles: {}, lang: null });
            controller.close();
          },
        });
        return capturedStream;
      },
    } as unknown as PdfTextStreamPage;

    await readPageTextContent(page);
    // A locked stream throws on a second getReader() call — this only
    // succeeds if readPageTextContent released its lock.
    expect(() => capturedStream.getReader()).not.toThrow();
  });

  it("releases the reader lock and propagates the error when reader.read() rejects mid-stream", async () => {
    let capturedStream!: ReadableStream;
    const page: PdfTextStreamPage = {
      streamTextContent: () => {
        capturedStream = new ReadableStream({
          start(controller) {
            controller.enqueue({ items: [{ str: "first chunk ok" }], styles: {}, lang: null });
          },
          pull(controller) {
            controller.error(new Error("Simulated stream failure"));
          },
        });
        return capturedStream;
      },
    } as unknown as PdfTextStreamPage;

    await expect(readPageTextContent(page)).rejects.toThrow("Simulated stream failure");
    expect(() => capturedStream.getReader()).not.toThrow();
  });

  it("still works when ReadableStream.prototype[Symbol.asyncIterator] is unavailable (the reported Safari gap)", async () => {
    const original = (ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator];
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- deliberately simulating the missing capability
    delete (ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator];
    try {
      expect((ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator]).toBeUndefined();
      const page = multiChunkFakePage([[{ str: "still" }], [{ str: "works" }]]);
      const text = await readPageTextContent(page);
      expect(text).toBe("still works");
    } finally {
      (ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator] = original;
    }
  });

  it("treats an item with no str property as empty text rather than throwing (marked-content items) — matches the original getTextContent-based join exactly", async () => {
    const page = multiChunkFakePage([[{ str: "a" } as { str: string }, {} as unknown as { str: string }, { str: "b" }]]);
    const text = await readPageTextContent(page);
    // Same behavior as the original `.map(item => "str" in item ? item.str : "").join(" ")`:
    // a missing-str item becomes "", so the join still has two spaces around it.
    expect(text).toBe("a  b");
  });
});

describe("readPageTextContent against a real pdfjs-dist page instance, with streamTextContent forced to fail", () => {
  it("propagates the real failure and still releases whatever lock was taken, for a genuine PDFPageProxy", async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([612, 792]);
    const bytes = await pdfDoc.save();

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const document = await loadingTask.promise;
    try {
      const page = await document.getPage(1);
      const realStreamTextContent = page.streamTextContent.bind(page);
      let called = false;
      page.streamTextContent = (...args: Parameters<typeof realStreamTextContent>) => {
        called = true;
        throw new Error("Simulated real-page streamTextContent failure");
      };
      await expect(readPageTextContent(page)).rejects.toThrow("Simulated real-page streamTextContent failure");
      expect(called).toBe(true);
      page.cleanup();
    } finally {
      await loadingTask.destroy();
    }
  });
});

describe("inspectWithPdfJs: real multi-page PDF, ReadableStream async iteration unavailable", () => {
  let asyncIteratorRemoved = false;

  afterEach(() => {
    if (asyncIteratorRemoved) {
      throw new Error("Test forgot to restore Symbol.asyncIterator — this would leak into other test files.");
    }
  });

  async function withoutAsyncIteration<T>(fn: () => Promise<T>): Promise<T> {
    const original = (ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator];
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- deliberately simulating the missing capability
    delete (ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator];
    asyncIteratorRemoved = true;
    try {
      return await fn();
    } finally {
      (ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator] = original;
      asyncIteratorRemoved = false;
    }
  }

  async function buildMultiPagePdf(pageTexts: string[]): Promise<Uint8Array> {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (const text of pageTexts) {
      const page = document.addPage([612, 792]);
      page.drawText(text, { x: 50, y: 700, size: 14, font });
    }
    return document.save();
  }

  it("still extracts correct page count and per-page text, in order, across multiple pages", async () => {
    const bytes = await buildMultiPagePdf(["First page content", "Second page content", "Third page content"]);

    const inspection = await withoutAsyncIteration(() => inspectWithPdfJs(bytes));

    expect(inspection.pageCount).toBe(3);
    expect(inspection.extractedText).toMatch(/First page content/);
    expect(inspection.extractedText).toMatch(/Second page content/);
    expect(inspection.extractedText).toMatch(/Third page content/);
    // Page order preserved: "First" appears before "Second" before "Third".
    const firstIndex = inspection.extractedText.indexOf("First");
    const secondIndex = inspection.extractedText.indexOf("Second");
    const thirdIndex = inspection.extractedText.indexOf("Third");
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(firstIndex).toBeLessThan(secondIndex);
    expect(secondIndex).toBeLessThan(thirdIndex);
  });

  it("still detects an unresolved {{placeholder}} token left in the generated PDF, on a later page of a multi-page document", async () => {
    const bytes = await buildMultiPagePdf(["Cover page, nothing unresolved here.", "Body page with {{request.records_description}} left unresolved."]);

    const inspection = await withoutAsyncIteration(() => inspectWithPdfJs(bytes));

    expect(inspection.pageCount).toBe(2);
    expect(inspection.extractedText).toMatch(/\{\{request\.records_description\}\}/);
  });

  it("also succeeds normally with ReadableStream async iteration available (sanity check the two code paths agree)", async () => {
    const bytes = await buildMultiPagePdf(["Only page"]);
    const inspection = await inspectWithPdfJs(bytes);
    expect(inspection.pageCount).toBe(1);
    expect(inspection.extractedText).toMatch(/Only page/);
  });
});

describe("inspectWithPdfJs: staged failures and resource cleanup", () => {
  it("classifies a failure to open the document as PdfInspectionError with stage 'document_open', and does not permanently break later inspections (loadingTask.destroy() still ran)", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    let thrown: unknown;
    try {
      await inspectWithPdfJs(garbage);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PdfInspectionError);
    expect((thrown as PdfInspectionError).stage).toBe("document_open");

    // Proves loadingTask.destroy() ran and cleaned up properly rather than
    // leaking a worker/document that would break a subsequent, valid call.
    const document = await PDFDocument.create();
    document.addPage([612, 792]);
    const inspection = await inspectWithPdfJs(await document.save());
    expect(inspection.pageCount).toBe(1);
  });
});
