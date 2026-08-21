import TabNav from "./TabNav";

const ADMIN_WORKSPACES = [
  { id: "posts", label: "Post Composer" },
  { id: "goals", label: "Goal Management" },
  { id: "documents", label: "Documents" },
  { id: "statistics", label: "County Statistics" },
  { id: "meetings", label: "Meetings" },
  { id: "chapter-accounts", label: "Chapter Master Management" },
  { id: "contacts", label: "Contact Emails / Phone Numbers" },
];

export default function AdminWorkspaceSwitcher({ activeWorkspace, onSelectWorkspace }) {
  return (
    <TabNav
      items={ADMIN_WORKSPACES}
      activeId={activeWorkspace}
      onSelect={onSelectWorkspace}
      label="Administrator workspaces"
    />
  );
}
