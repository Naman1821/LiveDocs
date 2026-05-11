"use client";

import Image from "next/image";
import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    title: "Liveblocks + Yjs collaboration",
    description:
      "Each document tab is its own room: Yjs CRDTs sync through Liveblocks so multiple people can type, see presence, and stay consistent without manual merge.",
  },
  {
    title: "AI rewrite & image",
    description:
      "Owner-controlled AI with a global kill-switch, optional encrypted user keys, and secure server routes for rewrites and image generation.",
  },
  {
    title: "Docs-grade editor & layout",
    description:
      "TipTap with tables, tasks, images, page breaks, ruler, two-column sections, block indent, and print-oriented chrome for long documents.",
  },
  {
    title: "Comments, threads & moderation",
    description:
      "Threaded comments on Liveblocks with tab-aware context, notifications, and owner moderation mirrored in Convex so everyone sees consistent states.",
  },
  {
    title: "Sharing that matches the backend",
    description:
      "Private documents, public links, editor vs viewer collaborators, access requests, and optional blocks for link visitors—enforced in Convex.",
  },
  {
    title: "Templates, DOCX import & PDF export",
    description:
      "Gallery starters (resume, letter, brochure-style layouts), optional .docx import when enabled, and PDF export plus print CSS from the menubar.",
  },
] as const;

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F6EFD9] text-[#1F1F1F]">
      <nav className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-4 border-b border-gray-200/90 bg-[#F6EFD9] px-4 py-3 md:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0]/40"
          aria-label="LiveDocs home"
        >
          <Image
            src="/logo.jpg"
            alt="LiveDocs"
            width={160}
            height={48}
            className="h-8 w-auto max-h-10 object-contain object-left md:h-9"
            priority
          />
        </Link>
        <div className="flex min-h-10 min-w-[11rem] items-center justify-end gap-2 sm:gap-3">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button
                variant="ghost"
                className="text-[#202124] hover:bg-[#e8eaed]/90"
              >
                Sign In
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button className="bg-[#0B57D0] text-white hover:bg-[#0842a0]">
                Get Started
              </Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </nav>

      {/* Top-aligned (not vertically centered) so Clerk sign-in/out does not shift the whole page */}
      <main className="flex w-full flex-1 flex-col items-center px-4 pb-20 pt-12 text-center sm:px-6 sm:pt-16">
        <h2
          className="max-w-3xl text-balance text-4xl font-bold tracking-tight text-[#202124] sm:text-5xl"
          style={{
            fontFamily: "var(--font-playfair-display), ui-serif, Georgia, serif",
          }}
        >
          Write, Collaborate, and Share in Real-Time
        </h2>
        <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-[#444746] sm:text-lg">
          LiveDocs pairs a TipTap-powered editor with Liveblocks and Yjs for true
          multi-user editing, Convex for data and permissions, and optional AI.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <Button
                size="lg"
                className="bg-[#0B57D0] text-white hover:bg-[#0842a0]"
              >
                Start Writing — It&apos;s Free
              </Button>
            </SignUpButton>
            <Button
              variant="outline"
              size="lg"
              className="border-[#dadce0] bg-white text-[#202124] hover:bg-[#f1f3f4]"
            >
              Learn More
            </Button>
          </Show>
          <Show when="signed-in">
            <Button
              size="lg"
              asChild
              className="bg-[#0B57D0] text-white hover:bg-[#0842a0]"
            >
              <Link href="/documents">Go to Dashboard</Link>
            </Button>
          </Show>
        </div>

        <div className="mt-20 grid w-full max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border border-[#dadce0] bg-white p-6 text-left shadow-sm transition-shadow hover:shadow-md"
            >
              <h3 className="text-[15px] font-semibold text-[#202124]">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5f6368]">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer
        className="mt-auto shrink-0 border-t border-[#dadce0] bg-[#F6EFD9] py-4"
        aria-hidden="true"
      />
    </div>
  );
}
