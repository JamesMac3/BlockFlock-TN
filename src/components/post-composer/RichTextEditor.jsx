import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { validateExternalUrl } from "../../utils/urlValidation";

const toolbarItems = [
  ["H2", "Heading 2", (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(), (editor) => editor.isActive("heading", { level: 2 })],
  ["H3", "Heading 3", (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(), (editor) => editor.isActive("heading", { level: 3 })],
  ["B", "Bold", (editor) => editor.chain().focus().toggleBold().run(), (editor) => editor.isActive("bold")],
  ["I", "Italic", (editor) => editor.chain().focus().toggleItalic().run(), (editor) => editor.isActive("italic")],
  ["• List", "Bullet list", (editor) => editor.chain().focus().toggleBulletList().run(), (editor) => editor.isActive("bulletList")],
  ["1. List", "Numbered list", (editor) => editor.chain().focus().toggleOrderedList().run(), (editor) => editor.isActive("orderedList")],
  ["Quote", "Block quote", (editor) => editor.chain().focus().toggleBlockquote().run(), (editor) => editor.isActive("blockquote")],
];

export default function RichTextEditor({ initialContent, onChange, disabled }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
      }),
      Link.configure({ openOnClick: false, autolink: false }),
    ],
    content: initialContent || "",
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      onChange({ json: currentEditor.getJSON(), text: currentEditor.getText() });
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return <p>Loading editor...</p>;

  function setLink() {
    const existing = editor.getAttributes("link").href ?? "";
    const value = window.prompt("HTTPS link address", existing);
    if (value === null) return;
    if (!value.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const result = validateExternalUrl(value);
    if (!result.valid) {
      window.alert(result.error);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: result.url }).run();
  }

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" role="toolbar" aria-label="Post formatting">
        <button type="button" onClick={() => editor.chain().focus().setParagraph().run()} aria-label="Paragraph" className={editor.isActive("paragraph") ? "is-active" : ""}>P</button>
        {toolbarItems.map(([label, name, action, active]) => (
          <button key={name} type="button" onClick={() => action(editor)} aria-label={name} className={active(editor) ? "is-active" : ""}>{label}</button>
        ))}
        <button type="button" onClick={setLink} aria-label="Add or edit link" className={editor.isActive("link") ? "is-active" : ""}>Link</button>
        <button type="button" onClick={() => editor.chain().focus().undo().run()} aria-label="Undo">Undo</button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} aria-label="Redo">Redo</button>
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} aria-label="Clear formatting">Clear</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
