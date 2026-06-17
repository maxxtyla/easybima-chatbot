'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cleanBimaText } from '@/lib/formatBimaMessages';

interface MessageContentProps {
  content: string;
  isUser: boolean;
}

export function MessageContent({ content, isUser }: MessageContentProps) {
  // User messages: plain text only, no markdown rendering
  if (isUser) {
    return (
      <p className="text-sm text-white leading-relaxed whitespace-pre-wrap break-words">
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
          // Paragraphs
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 leading-relaxed">
              {children}
            </p>
          ),

          // Headings — keep them compact for a chat bubble
          h1: ({ children }) => (
            <p className="font-bold text-gray-900 mb-2 mt-3 first:mt-0">
              {children}
            </p>
          ),
          h2: ({ children }) => (
            <p className="font-semibold text-gray-900 mb-2 mt-3 first:mt-0">
              {children}
            </p>
          ),
          h3: ({ children }) => (
            <p className="font-semibold text-gray-700 mb-1 mt-2 first:mt-0">
              {children}
            </p>
          ),

          // Unordered lists
          ul: ({ children }) => (
            <ul className="mb-3 last:mb-0 space-y-1 pl-1">
              {children}
            </ul>
          ),

          // Ordered lists
          ol: ({ children }) => (
            <ol className="mb-3 last:mb-0 space-y-1 pl-1 list-decimal list-inside">
              {children}
            </ol>
          ),

          // List items — custom bullet so it matches CIC red brand
          li: ({ children }) => (
            <li className="flex items-start gap-2 leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cic-red" />
              <span>{children}</span>
            </li>
          ),

          // Bold
          strong: ({ children }) => (
            <strong className="font-semibold text-gray-900">
              {children}
            </strong>
          ),

          // Italic
          em: ({ children }) => (
            <em className="italic text-gray-700">
              {children}
            </em>
          ),

          // Clickable links — open in new tab
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

          // Blockquote — used for tips / callouts
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-cic-red bg-red-50 pl-3 pr-2 py-2 my-3 rounded-r-md text-gray-700 italic">
              {children}
            </blockquote>
          ),

          // Inline code
          code: ({ children }) => (
            <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">
              {children}
            </code>
          ),

          // Suppress horizontal rules — they look odd in a bubble
          hr: () => null,
        }}
      >
        {cleanedContent}
      </ReactMarkdown>
    </div>
  );
}