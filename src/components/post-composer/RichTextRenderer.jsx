import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { renderToReactElement } from "@tiptap/static-renderer";
import ExternalLinkWarning from "./ExternalLinkWarning";
import "./PostContent.css";

const rendererExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    strike: false,
    horizontalRule: false,
  }),
  Link.configure({ openOnClick: false }),
];

export default function RichTextRenderer({ bodyRich, body }) {
  let rendered = null;

  if (bodyRich?.type === "doc" && Array.isArray(bodyRich.content)) {
    try {
      rendered = renderToReactElement({
        content: bodyRich,
        extensions: rendererExtensions,
        options: {
          unhandledNode: () => null,
          unhandledMark: ({ children }) => children,
        },
      });
    } catch (error) {
      console.warn("Rich post body could not be rendered; using plain-text fallback.", error);
    }
  }

  return (
    <ExternalLinkWarning>
      <div className="rich-text-renderer">
        {rendered ?? <p className="rich-text-renderer__fallback">{body}</p>}
      </div>
    </ExternalLinkWarning>
  );
}
