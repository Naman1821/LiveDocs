"use client";

import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 border-b">
        <h1 className="text-xl font-bold">LiveDocs</h1>
        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="ghost">Sign In</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button>Get Started</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h2 className="max-w-3xl text-5xl font-bold tracking-tight">
          Write, Collaborate, and Share in Real-Time
        </h2>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          A powerful collaborative document editor. Work together with your team
          in real-time with AI-powered writing assistance.
        </p>
        <div className="mt-10 flex gap-4">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <Button size="lg">Start Writing — It&apos;s Free</Button>
            </SignUpButton>
            <Button variant="outline" size="lg">
              Learn More
            </Button>
          </Show>
          <Show when="signed-in">
            <Button size="lg" asChild>
              <a href="/documents">Go to Dashboard</a>
            </Button>
          </Show>
        </div>

        {/* Features */}
        <div className="mt-24 grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: "Real-time Collaboration",
              description: "Edit documents together with your team. See live cursors and changes instantly.",
            },
            {
              title: "AI Writing Assistant",
              description: "Get AI-powered suggestions to improve your writing with a simple slash command.",
            },
            {
              title: "Rich Text Editor",
              description: "Format text with fonts, colors, tables, images, and 15+ formatting tools.",
            },
            {
              title: "Version History",
              description: "Travel back in time. Compare versions and restore any previous state.",
            },
            {
              title: "Share & Permissions",
              description: "Share documents with anyone. Control who can view and who can edit.",
            },
            {
              title: "Export Anywhere",
              description: "Export your documents to PDF, HTML, TXT, or JSON with one click.",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border p-6 text-left transition-colors hover:bg-muted/50"
            >
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t px-6 py-6 text-center text-sm text-muted-foreground">
        Built with Next.js, Tiptap, Liveblocks & Convex. Deployed on Vercel.
      </footer>
    </div>
  );
}