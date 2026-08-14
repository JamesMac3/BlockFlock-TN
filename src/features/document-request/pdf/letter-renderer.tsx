import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type { RequestProfile } from "./profile-schema";
import type { RequestDocumentData } from "./request-data-schema";
import { readPlaceholderValue, resolvePlaceholders } from "./placeholder-resolver";
import type { PdfRenderer, RendererContext, RenderedPdf } from "./template-resolver";

export type LetterRendererErrorCode =
  | "WRONG_RENDERER"
  | "EMPTY_TEMPLATE"
  | "BLOCK_INVALID"
  | "LETTER_TOO_LARGE"
  | "PDF_RENDER_FAILED";

export class LetterRendererError extends Error {
  constructor(
    readonly code: LetterRendererErrorCode,
    message: string,
    readonly blockId?: string,
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "LetterRendererError";
  }
}

export type ResolvedLetterBlock = Readonly<{
  id: string;
  type: RequestProfile["template_schema"]["blocks"][number]["type"];
  text?: string;
  lines?: readonly string[];
  items?: readonly string[];
  locked: boolean;
}>;

export function resolveLetterBlocks(
  profile: RequestProfile,
  data: RequestDocumentData,
): readonly ResolvedLetterBlock[] {
  if (profile.renderer_type !== "generated_letter") {
    throw new LetterRendererError("WRONG_RENDERER", "The letter renderer received a different profile type.");
  }
  const output: ResolvedLetterBlock[] = [];
  for (const block of profile.template_schema.blocks) {
    if (block.include_when_present) {
      const value = readPlaceholderValue(block.include_when_present, data);
      if (value === undefined || value === null || value === "") continue;
    }
    try {
      const text = block.text === undefined ? undefined : resolvePlaceholders(block.text, data).text;
      const lines = block.lines?.map((line) => resolvePlaceholders(
        line,
        data,
        { missing: block.omit_empty_lines ? "empty" : "error" },
      ).text).filter((line) => !block.omit_empty_lines || line !== "");
      const items = block.items?.map((item) => resolvePlaceholders(item, data).text);
      output.push({ id: block.id, type: block.type, text, lines, items, locked: block.locked });
    } catch (error) {
      throw new LetterRendererError("BLOCK_INVALID", "A letter block could not be resolved safely.", block.id, error);
    }
  }
  if (output.length === 0) throw new LetterRendererError("EMPTY_TEMPLATE", "The generated letter contains no renderable blocks.");
  return output;
}

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 11, lineHeight: 1.35, paddingTop: 64, paddingBottom: 64, paddingHorizontal: 72 },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 14, marginBottom: 12 },
  address: { marginBottom: 16 },
  paragraph: { marginBottom: 12, textAlign: "left" },
  notice: { borderWidth: 1, borderColor: "#444444", backgroundColor: "#F4F4F4", padding: 10, marginBottom: 12 },
  bulletRow: { flexDirection: "row", marginBottom: 5 },
  bullet: { width: 14 },
  bulletText: { flexGrow: 1 },
  spacer: { height: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#777777", marginVertical: 10 },
  signature: { marginTop: 20 },
  footer: { position: "absolute", bottom: 28, left: 72, right: 72, textAlign: "center", fontSize: 9, color: "#666666" },
});

function LetterBlock({ block }: { block: ResolvedLetterBlock }) {
  switch (block.type) {
    case "heading": return <Text style={styles.heading}>{block.text}</Text>;
    case "address": return <View style={styles.address}>{block.lines?.map((line, index) => <Text key={index}>{line}</Text>)}</View>;
    case "paragraph": return <Text style={styles.paragraph}>{block.text}</Text>;
    case "notice": return <Text style={styles.notice}>{block.text}</Text>;
    case "bullet_list": return <View>{block.items?.map((item, index) => <View key={index} style={styles.bulletRow}><Text style={styles.bullet}>•</Text><Text style={styles.bulletText}>{item}</Text></View>)}</View>;
    case "spacer": return <View style={styles.spacer} />;
    case "divider": return <View style={styles.divider} />;
    case "signature": return <View style={styles.signature}>{block.lines?.map((line, index) => <Text key={index}>{line}</Text>)}</View>;
    case "page_break": return <View break />;
  }
}

function LetterDocument({ profile, data, blocks }: { profile: RequestProfile; data: RequestDocumentData; blocks: readonly ResolvedLetterBlock[] }) {
  const title = resolvePlaceholders(profile.output_options.pdf_title_pattern, data).text;
  const margin = profile.output_options.margin_points;
  return (
    <Document title={title} author="Flock Block" creator="Flock Block document request generator">
      <Page size="LETTER" style={[styles.page, { paddingTop: margin, paddingBottom: margin, paddingHorizontal: margin }]} wrap>
        {blocks.map((block) => <LetterBlock key={block.id} block={block} />)}
        {profile.output_options.show_page_numbers && (
          <Text
            fixed
            style={[styles.footer, { left: margin, right: margin, bottom: Math.max(20, margin / 2) }]}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        )}
      </Page>
    </Document>
  );
}

async function renderLetter(context: RendererContext): Promise<RenderedPdf> {
  const { profile, data } = context;
  const blocks = resolveLetterBlocks(profile, data);
  try {
    const blob = await pdf(<LetterDocument profile={profile} data={data} blocks={blocks} />).toBlob();
    if (blob.size > 25 * 1024 * 1024) throw new LetterRendererError("LETTER_TOO_LARGE", "The generated letter exceeds 25 MB.");
    return { pdfBytes: new Uint8Array(await blob.arrayBuffer()), warnings: [], diagnostics: [] };
  } catch (error) {
    if (error instanceof LetterRendererError) throw error;
    throw new LetterRendererError("PDF_RENDER_FAILED", "The generated letter could not be rendered.", undefined, error);
  }
}

export function createLetterRenderer(): PdfRenderer {
  return (context) => renderLetter(context);
}
