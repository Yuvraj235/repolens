import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepoLens — see only the context that matters",
  description:
    "RepoLens ingests a GitHub repo and answers questions about it, compressing the codebase into the minimal relevant context before it ever reaches the model — and shows you the token savings.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
