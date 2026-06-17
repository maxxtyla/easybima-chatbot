# CIC Insurance Chatbot - Frontend Setup Guide

## Table of Contents

1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Technology Stack](#technology-stack)
4. [Color Palette](#color-palette)
5. [Installation & Setup](#installation--setup)
6. [Development](#development)
7. [Component Architecture](#component-architecture)
8. [Configuration](#configuration)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The CIC Insurance Chatbot frontend is a modern Next.js 15 application built with React 19 and TypeScript. It provides a fully responsive chat widget with CIC brand styling, integrated with the backend API for real-time conversations.

### Key Features

- ✨ **Modern UI/UX** - Clean, professional design matching CIC branding
- 🎨 **Fully Customizable** - Tailwind CSS with CIC brand color tokens
- 📱 **Responsive Design** - Works seamlessly on mobile, tablet, and desktop
- 💬 **Chat Widget** - Floating button with expandable chat window
- 🔄 **State Management** - Custom React hooks for chat logic
- 🌙 **Accessibility** - WCAG compliant with proper ARIA labels
- 📦 **Type Safe** - Full TypeScript support throughout

---

## Project Structure

```
frontend/
├── package.json                          # Dependencies and scripts
├── tsconfig.json                         # TypeScript configuration
├── tailwind.config.ts                    # Tailwind CSS with CIC colors
├── tailwind.config.ts                    # Tailwind CSS with CIC colors
├── next.config.ts                        # Next.js 15 configuration
├── postcss.config.js                     # PostCSS configuration
├── .eslintrc.json                        # ESLint configuration
├── .env.example                          # Environment variables template
│
└── src/
    ├── app/
    │   ├── layout.tsx                    # Root layout with metadata
    │   ├── page.tsx                      # Main landing page with chat widget
    │   └── providers.tsx                 # Client-side providers wrapper
    │
    ├── components/
    │   └── chat/
    │       ├── ChatWidget.tsx            # Floating chat button + popup
    │       ├── ChatWindow.tsx            # Main chat container
    │       ├── Header.tsx                # CIC red header with avatar
    │       ├── MessageList.tsx           # Scrollable message area
    │       ├── MessageBubble.tsx         # User (red) / Assistant (white) bubbles
    │       ├── TypingIndicator.tsx       # Animated loading dots
    │       ├── InputBar.tsx              # Text input + send button
    │       └── QuickQuestions.tsx        # Suggestion cards grid
    │
    ├── hooks/
    │   └── useChat.ts                    # Chat state and API interaction
    │
    ├── lib/
    │   ├── utils.ts                      # Utility functions (cn, generateId, formatTime)
    │   └── api.ts                        # API client functions
    │
    ├── types/
    │   └── chat.ts                       # TypeScript type definitions
    │
    └── styles/
        └── globals.css                   # Global styles + Tailwind imports
```

---

## Technology Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Next.js** | 15.0.0 | React framework with SSR/SSG |
| **React** | 19.0.0 | UI library |
| **React DOM** | 19.0.0 | React rendering engine |
| **TypeScript** | 5.3.3+ | Static typing |
| **Tailwind CSS** | 3.4.0 | Utility-first styling |
| **PostCSS** | 8.4.31 | CSS transformations |
| **ESLint** | 8.54.0 | Code linting |

---

## Color Palette

All colors are defined in `tailwind.config.ts` and can be used throughout the application.

### Primary Colors

| Token | Hex Value | Usage | Tailwind Class |
|-------|-----------|-------|-----------------|
| **CIC Red** | `#AC202D` | Headers, buttons, user bubbles, branding | `bg-cic-red`, `text-cic-red` |
| **CIC Red Dark** | `#8B1A25` | Hover states, darker accents | `bg-cic-red-dark`, `text-cic-red-dark` |
| **CIC Red Light** | `#D63944` | Light accents, secondary highlights | `bg-cic-red-light`, `text-cic-red-light` |

### Secondary Colors

| Token | Hex Value | Usage | Tailwind Class |
|-------|-----------|-------|-----------------|
| **Cod Gray** | `#111111` | Typography, dark elements | `bg-cic-gray`, `text-cic-gray` |
| **Light Gray** | `#F9FAFB` | Chat window background | `bg-cic-light` |
| **White** | `#FFFFFF` | Assistant bubbles, input background | `bg-cic-white`, `text-cic-white` |

### Usage Examples

```tsx
// Apply CIC Red button
<button className="bg-cic-red text-cic-white hover:bg-cic-red-dark">
  Send
</button>

// Apply light gray background
<div className="bg-cic-light">
  Chat content area
</div>

// Apply neutral palette
<p className="text-neutral-600">Secondary text</p>
```

---

## Installation & Setup

### Prerequisites

- **Node.js** 18+ or 20+
- **npm** 9+ or **yarn** 3.6+
- **Git** for version control

### Step 1: Clone the Repository

```bash
cd frontend
```

### Step 2: Install Dependencies

```bash
npm install
```

Or with yarn:

```bash
yarn install
```

### Step 3: Environment Configuration

Create a `.env.local` file from the template:

```bash
cp .env.example .env.local
```

Update the environment variables:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:5000

# Chat Widget Configuration
NEXT_PUBLIC_CHAT_ENABLED=true
NEXT_PUBLIC_CHAT_POSITION=bottom-right
```

### Step 4: Verify Installation

```bash
npm run type-check
```

---

## Development

### Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

### Lint Code

```bash
npm run lint
```

### Type Check

```bash
npm run type-check
```

---

## Component Architecture

### Chat Widget Component Tree

```
ChatWidget (Floating Button)
├── ChatWindow (Main Container)
│   ├── Header
│   │   └── Close Button
│   ├── MessageList
│   │   ├── MessageBubble[] (Rendered Messages)
│   │   └── TypingIndicator (While Loading)
│   ├── QuickQuestions (If No Messages)
│   └── InputBar
│       ├── Input Field
│       └── Send Button
```

### Data Flow

```
User Input (InputBar)
    ↓
useChat Hook (State Management)
    ↓
sendMessage API Call
    ↓
Backend API
    ↓
Response → MessageList
    ↓
MessageBubble Rendered
```

---

## Component Details

### ChatWidget

**Location:** `src/components/chat/ChatWidget.tsx`

Main floating widget with toggle button. Handles open/close state and outside clicks.

**Props:**
- None (uses internal state)

**Features:**
- Floating position (bottom-right)
- Smooth animations
- Click-outside detection
- Accessible button with ARIA labels

### ChatWindow

**Location:** `src/components/chat/ChatWindow.tsx`

Container component that orchestrates the chat UI.

**Props:**
- `onClose?: () => void` - Callback when close button clicked

**Features:**
- Displays Header, MessageList, and InputBar
- Shows QuickQuestions when no messages exist
- Manages message loading state

### Header

**Location:** `src/components/chat/Header.tsx`

CIC branded header with avatar and close button.

**Props:**
- `onClose?: () => void` - Close button callback

**Features:**
- CIC Red background (#AC202D)
- Avatar with "C" logo
- Online status indicator
- Close button for mobile

### MessageList

**Location:** `src/components/chat/MessageList.tsx`

Scrollable container for messages with auto-scroll to latest.

**Props:**
- `messages: Message[]` - Array of messages
- `isLoading: boolean` - Show typing indicator

**Features:**
- Auto-scroll to newest message
- Empty state display
- Loading indicator while waiting

### MessageBubble

**Location:** `src/components/chat/MessageBubble.tsx`

Individual message display with styling based on role.

**Props:**
- `message: Message` - Message object to display

**Features:**
- User messages: CIC Red with white text
- Assistant messages: White with dark text
- Timestamp display
- Rounded bubble styling

### TypingIndicator

**Location:** `src/components/chat/TypingIndicator.tsx`

Animated three-dot loading indicator.

**Features:**
- Smooth pulse animation
- Staggered timing
- Lightweight animation

### InputBar

**Location:** `src/components/chat/InputBar.tsx`

Text input with send button.

**Props:**
- `onSend: (message: string) => void` - Send callback
- `isLoading?: boolean` - Disable while loading
- `placeholder?: string` - Input placeholder

**Features:**
- Form submission
- Loading state button
- Character validation
- Focus ring styling

### QuickQuestions

**Location:** `src/components/chat/QuickQuestions.tsx`

Grid of suggestion cards for quick message selection.

**Props:**
- `questions: QuickQuestion[]` - Array of suggestions
- `onSelect: (question: string) => void` - Selection callback
- `isLoading?: boolean` - Disable while loading

**Features:**
- 2-column responsive grid
- Hover effects
- Click to send as message

---

## Hooks

### useChat

**Location:** `src/hooks/useChat.ts`

Custom hook managing chat state and API interactions.

**Usage:**

```tsx
const {
  messages,
  isLoading,
  sessionId,
  isOpen,
  handleSendMessage,
  addMessage,
  clearMessages,
  toggleChat,
} = useChat()
```

**Features:**
- Session persistence in localStorage
- Message history management
- API error handling
- Loading state

**API:**
- `handleSendMessage(message: string)` - Send user message
- `addMessage(role, content)` - Manually add message
- `clearMessages()` - Clear all messages
- `toggleChat()` - Toggle widget open/closed

---

## Utilities

### `cn()` - Class Name Utility

```tsx
import { cn } from '@/lib/utils'

// Combines classes conditionally
cn('base-class', isActive && 'active-class', condition ? 'class-a' : 'class-b')
```

### `generateId()` - Unique ID Generation

```tsx
const id = generateId() // Returns timestamp-based unique ID
```

### `formatTime()` - Timestamp Formatting

```tsx
formatTime(timestamp) // Returns "5m ago", "2h ago", etc.
```

### `truncateText()` - Text Truncation

```tsx
truncateText('Long text here...', 30) // Returns truncated text with ellipsis
```

---

## API Functions

### `sendMessage()`

Sends a user message to the backend.

```tsx
const response = await sendMessage(sessionId, userMessage)
// Returns: { message: string, sessionId: string }
```

### `checkHealth()`

Verifies backend API is running.

```tsx
const health = await checkHealth()
// Returns: { status: string }
```

---

## Configuration

### Tailwind Configuration

File: `tailwind.config.ts`

Custom extensions include:
- CIC color palette
- Custom animations (fade-in, slide-up)
- Extended shadows for chat widget
- Custom border radius (bubble: 18px)

### Next.js Configuration

File: `next.config.ts`

Features:
- React strict mode enabled
- Page extensions: `.ts`, `.tsx`
- Environment variables loaded

### TypeScript Configuration

File: `tsconfig.json`

- Strict mode enabled
- Path aliases configured (`@/*` → `./src/*`)
- DOM and ES2020 library support

---

## Responsive Design

The application is fully responsive:

### Breakpoints

- **Mobile**: < 640px (sm)
- **Tablet**: 640px - 1024px (md)
- **Desktop**: > 1024px (lg)

### Widget Positioning

```tsx
// On mobile: small button, compact chat
// On desktop: larger button, full-size chat window
className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6"
```

### Chat Window Size

```tsx
// Responsive width and height
className="w-96 h-96 sm:w-96 sm:h-[500px]"
```

---

## Accessibility

### WCAG Compliance

- Semantic HTML structure
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus indicators visible
- Color contrast meets AA standards

### Keyboard Navigation

- **Tab**: Navigate between interactive elements
- **Enter**: Send message or select quick question
- **Escape**: Close chat widget
- **Shift+Tab**: Reverse tab order

---

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Connect repository to Vercel
3. Set environment variables:
   - `NEXT_PUBLIC_API_URL` → Production API URL
4. Deploy automatically on push

### Docker

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t cic-chatbot-frontend .
docker run -p 3000:3000 cic-chatbot-frontend
```

### Manual Deployment

```bash
npm run build
npm start
```

---

## Performance Optimization

### Code Splitting

- Automatic with Next.js dynamic imports
- Chat components loaded on demand

### Image Optimization

- Next.js Image component (if needed)
- WebP format support

### CSS Optimization

- Tailwind purges unused CSS
- Only shipped CSS for used classes

---

## Troubleshooting

### Chat Widget Not Appearing

**Problem:** Widget button not visible

**Solution:**
1. Check z-index: `z-50` should overlay other elements
2. Verify CSS is loaded: Check `globals.css` import
3. Ensure `ChatWidget` is rendered in page

### API Connection Issues

**Problem:** Messages not sending

**Solution:**
1. Check `NEXT_PUBLIC_API_URL` in `.env.local`
2. Verify backend server is running
3. Check browser console for errors
4. Test API with: `curl http://localhost:5000/health`

### Styling Issues

**Problem:** Colors not applying correctly

**Solution:**
1. Run `npm run build` to regenerate Tailwind CSS
2. Clear `.next` cache: `rm -rf .next`
3. Restart dev server: `npm run dev`
4. Verify color values in `tailwind.config.ts`

### TypeScript Errors

**Problem:** Type errors during build

**Solution:**
1. Run type check: `npm run type-check`
2. Check `tsconfig.json` strict mode
3. Ensure all imports have proper types
4. Install missing `@types/*` packages

### Performance Issues

**Problem:** Slow initial load or chat lag

**Solution:**
1. Check network tab in DevTools
2. Verify API response times
3. Monitor for memory leaks in browser
4. Run Lighthouse audit
5. Consider virtualization for large message lists

---

## Environment Variables

### Development (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_CHAT_ENABLED=true
NEXT_PUBLIC_CHAT_POSITION=bottom-right
```

### Production (.env.production)

```env
NEXT_PUBLIC_API_URL=https://api.cicinsurancegroup.com
NEXT_PUBLIC_CHAT_ENABLED=true
NEXT_PUBLIC_CHAT_POSITION=bottom-right
```

---

## Scripts Reference

```bash
npm run dev           # Start development server (port 3000)
npm run build         # Build for production
npm start             # Start production server
npm run lint          # Run ESLint
npm run type-check    # Run TypeScript type checking
```

---

## Best Practices

### Component Development

1. Use TypeScript for all components
2. Keep components focused and reusable
3. Use custom hooks for logic
4. Apply Tailwind classes consistently
5. Add proper ARIA labels

### Styling

1. Use CIC color tokens (not hardcoded colors)
2. Leverage Tailwind utilities
3. Use responsive prefixes (md:, sm:, lg:)
4. Avoid inline styles

### State Management

1. Prefer custom hooks over context for simple state
2. Use localStorage for persistence
3. Handle loading and error states
4. Clear messages when needed

### Performance

1. Memoize expensive computations
2. Use React.lazy for code splitting
3. Optimize re-renders
4. Monitor bundle size

---

## Contributing

When adding new features:

1. Create feature branch from `main`
2. Follow existing code patterns
3. Add TypeScript types
4. Update documentation
5. Submit pull request

---

## Support & Resources

- **Next.js Docs**: https://nextjs.org/docs
- **React 19 Docs**: https://react.dev
- **Tailwind CSS Docs**: https://tailwindcss.com/docs
- **TypeScript Docs**: https://www.typescriptlang.org/docs/

---

## License

© 2026 CIC Insurance Group. All rights reserved.

---

## Quick Reference

### Adding a New Route

1. Create file in `src/app/[route]/page.tsx`
2. Add layout if needed: `src/app/[route]/layout.tsx`
3. Export default component
4. Automatic routing via Next.js file structure

### Adding a New Component

1. Create file in `src/components/`
2. Add TypeScript types
3. Mark as `'use client'` if interactive
4. Export named component
5. Import in parent component

### Adding a New Hook

1. Create file in `src/hooks/useYourHook.ts`
2. Export custom hook function
3. Use in components marked `'use client'`
4. Type return value properly

### Styling Best Practices

```tsx
// ✅ Good - Use CIC colors and Tailwind
<button className="bg-cic-red text-cic-white hover:bg-cic-red-dark">

// ❌ Bad - Hardcoded colors
<button style={{ backgroundColor: '#AC202D' }}>

// ✅ Good - Responsive
<div className="w-full md:w-1/2 lg:w-1/3">

// ❌ Bad - Hardcoded breakpoints
<div style={{ width: window.innerWidth > 768 ? '50%' : '100%' }}>
```

---

**Last Updated:** June 2026  
**Version:** 1.0.0
