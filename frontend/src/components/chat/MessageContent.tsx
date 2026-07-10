'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cleanBimaText } from '@/lib/formatBimaMessages';

interface MessageContentProps {
  content: string;
  isUser: boolean;
  isSystem?: boolean
}

export function MessageContent({ content, isUser, isSystem }: MessageContentProps) {
  // System and user messages: plain text only, no markdown rendering
  if (isUser || isSystem) {
    return (
      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
        {content}
      </p>
    );
  }

  const cleanedContent = cleanBimaText(content);

  return (
    <div className="bima-response text-sm text-gray-800 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Paragraphs ──────────────────────────────────────────────────
          // mb-2 (8px) between paragraphs; last-child gets no bottom margin
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 leading-relaxed">
              {children}
            </p>
          ),

          // ── Headings — compact for chat bubbles ─────────────────────────
          h1: ({ children }) => (
            <p className="font-bold text-gray-900 mb-1 mt-3 first:mt-0">
              {children}
            </p>
          ),
          h2: ({ children }) => (
            <p className="font-semibold text-gray-900 mb-1 mt-2 first:mt-0">
              {children}
            </p>
          ),
          h3: ({ children }) => (
            <p className="font-semibold text-gray-700 mb-1 mt-2 first:mt-0">
              {children}
            </p>
          ),

          // ── Unordered lists ─────────────────────────────────────────────
          // pl-0 so the list itself is not indented; indentation comes from
          // the flex layout on each <li> via the gap between bullet and text.
          ul: ({ children }) => (
            <ul className="mb-2 last:mb-0 space-y-0.5 pl-0">
              {children}
            </ul>
          ),

          // ── Ordered lists ───────────────────────────────────────────────
          ol: ({ children }) => (
            <ol className="mb-2 last:mb-0 space-y-0.5 pl-4 list-decimal">
              {children}
            </ol>
          ),

          // ── List items — custom CIC-red bullet ──────────────────────────
          // Using a CSS class for the dot so margin-top aligns it precisely
          // with the cap-height of 14px Inter text (see globals.css).
          li: ({ children }) => (
            <li className="flex items-start gap-2 leading-relaxed">
              <span
                className="bima-bullet bg-cic-red flex-shrink-0"
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0">{children}</span>
            </li>
          ),

          // ── Inline elements ─────────────────────────────────────────────
          strong: ({ children }) => (
            <strong className="font-semibold text-gray-900">
              {children}
            </strong>
          ),

          em: ({ children }) => (
            <em className="italic text-gray-700">
              {children}
            </em>
          ),

          // ── Links — open in new tab ─────────────────────────────────────
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cic-red underline underline-offset-2 hover:text-cic-red-dark transition-colors break-all"
            >
              {children}
            </a>
          ),

          // ── Blockquote — tips / callouts ────────────────────────────────
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-cic-red bg-red-50 pl-3 pr-2 py-2 my-2 rounded-r-md text-gray-700 italic">
              {children}
            </blockquote>
          ),

          // ── Inline code ─────────────────────────────────────────────────
          code: ({ children }) => (
            <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">
              {children}
            </code>
          ),

          // ── Suppress horizontal rules — look odd in chat bubbles ────────
          hr: () => null,
        }}
      >
        {cleanedContent}
      </ReactMarkdown>
    </div>
  );
}
