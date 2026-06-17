# CIC Chatbot Frontend - Quick Start Guide

Get the CIC Insurance Chatbot frontend running in 5 minutes!

## 🚀 Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- npm 9+ or yarn 3.6+
- Backend API running on `http://localhost:5000`
- Git

## ⚡ Quick Start (5 minutes)

### 1. Navigate to Frontend Directory

```bash
cd frontend
```

### 2. Install Dependencies

```bash
npm install
```

This installs:
- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- And other dependencies

**Time:** ~2-3 minutes (depending on connection)

### 3. Setup Environment

```bash
cp .env.example .env.local
```

The default `.env.local` is already configured for local development:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_CHAT_ENABLED=true
NEXT_PUBLIC_CHAT_POSITION=bottom-right
```

### 4. Start Development Server

```bash
npm run dev
```

Output:
```
  ▲ Next.js 15.0.0
  - Local:        http://localhost:3000
  - Environments: .env.local

✓ Ready in 2.3s
```

### 5. Open in Browser

Visit **`http://localhost:3000`** 🎉

You should see:
- CIC-branded landing page
- Red navigation header
- Chat widget button in bottom-right
- Full responsive design

## 🧪 Test the Chat Widget

### 1. Click the Chat Button

Red button in bottom-right corner with chat icon

### 2. See Quick Questions

When chat opens, you'll see suggested questions:
- "How do I get a quote?"
- "What insurance products do you offer?"
- etc.

### 3. Send a Message

Type a message or click a quick question

### 4. Backend Response

If backend is running, you'll see:
- Your message in CIC red bubble
- Assistant response in white bubble
- Automatic scroll to latest message

## 📁 Project Structure Overview

```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx           ← Main page (landing + chat)
│   │   ├── layout.tsx         ← Root layout
│   │   └── providers.tsx      ← Client providers
│   │
│   ├── components/chat/
│   │   ├── ChatWidget.tsx     ← Floating button
│   │   ├── ChatWindow.tsx     ← Chat container
│   │   ├── Header.tsx         ← Red header
│   │   ├── MessageList.tsx    ← Messages area
│   │   ├── InputBar.tsx       ← Input field
│   │   └── ...other components
│   │
│   ├── hooks/
│   │   └── useChat.ts         ← Chat logic hook
│   │
│   ├── lib/
│   │   ├── api.ts             ← API calls
│   │   └── utils.ts           ← Helper functions
│   │
│   └── types/
│       └── chat.ts            ← TypeScript types
│
├── package.json               ← Dependencies
├── next.config.ts             ← Next.js config
├── tailwind.config.ts         ← Tailwind colors
└── .env.local                 ← Environment vars
```

## 🎨 Key Features

### CIC Brand Colors

Used automatically via Tailwind classes:

```tsx
// CIC Red - buttons, headers, user messages
<button className="bg-cic-red text-cic-white">
  Send
</button>

// Light gray - chat background
<div className="bg-cic-light">Chat</div>

// Neutral palette
<p className="text-neutral-600">Secondary text</p>
```

### Responsive Design

Automatically adapts to screen size:

```
Mobile (< 640px)  → Compact layout
Tablet (640-1024) → Medium layout  
Desktop (> 1024)  → Full layout
```

### Chat Messages

Two message types:

```
User Message      → CIC Red bubble (#AC202D)
Assistant Message → White bubble with border
```

## 📝 Common Commands

```bash
npm run dev              # Start development server
npm run build            # Build for production
npm start                # Start production server
npm run lint             # Check code style
npm run type-check       # Check TypeScript errors
```

## 🔧 Configuration

### Change API URL

Edit `.env.local`:

```env
NEXT_PUBLIC_API_URL=https://api.production.com
```

No rebuild needed - Next.js hot reloads!

### Change Widget Position

In `src/components/chat/ChatWidget.tsx`:

```tsx
<div className="fixed z-50 bottom-4 right-4">
  {/* Change to: left-4, top-4, etc. */}
</div>
```

### Customize Colors

Edit `tailwind.config.ts`:

```ts
colors: {
  'cic-red': '#AC202D',  // Change me!
  'cic-gray': '#111111',
  'cic-light': '#F9FAFB',
}
```

## 🐛 Troubleshooting

### "ChatWidget not showing"

1. Check if development server is running
2. Open browser DevTools (F12)
3. Look for errors in Console tab
4. Try hard refresh (Ctrl+Shift+R)

### "Cannot POST /api/chat/v2"

Backend API not running. Start it:

```bash
cd backend
npm run dev
```

### "Styles look broken"

Clear Next.js cache:

```bash
rm -rf .next
npm run dev
```

### "Port 3000 already in use"

Kill the process or use different port:

```bash
npm run dev -- -p 3001
```

## 🧬 What's Next?

### Customize the Landing Page

Edit `src/app/page.tsx` to:
- Change hero text
- Modify service cards
- Update footer links
- Add more sections

### Add More Features

- [ ] Add voice input to chat
- [ ] Add file upload support
- [ ] Add rating system
- [ ] Add conversation export

### Deploy to Production

1. **Vercel** (easiest)
   - Connect GitHub repo
   - Auto-deploys on push
   - Free tier available

2. **Docker**
   ```bash
   docker build -t cic-chatbot .
   docker run -p 3000:3000 cic-chatbot
   ```

3. **Traditional Server**
   ```bash
   npm run build
   npm start
   ```

## 📚 Documentation

For detailed guides, see:

- [FRONTEND_SETUP_GUIDE.md](../docs/FRONTEND_SETUP_GUIDE.md) - Complete documentation
- [WIDGET_INTEGRATION_GUIDE.md](../docs/WIDGET_INTEGRATION_GUIDE.md) - Embed widget anywhere
- [README.md](./README.md) - Project overview

## 💡 Tips & Tricks

### Hot Reload

Changes to files automatically reload:
- Edit component → see changes instantly
- No manual refresh needed!

### Debug Mode

Open browser DevTools:
```
F12 or Right-click → Inspect
```

View:
- Network tab → API calls
- Console tab → Errors
- React DevTools → Component hierarchy

### Performance

Check site speed:
```bash
npm run build
npm start
# Then run Lighthouse audit in DevTools
```

### TypeScript

Check for type errors:
```bash
npm run type-check
```

Fix common issues with better IDE support!

## 🆘 Getting Help

### Check Documentation

- [FRONTEND_SETUP_GUIDE.md](../docs/FRONTEND_SETUP_GUIDE.md)
- [WIDGET_INTEGRATION_GUIDE.md](../docs/WIDGET_INTEGRATION_GUIDE.md)
- [Next.js Docs](https://nextjs.org/docs)
- [Tailwind Docs](https://tailwindcss.com/docs)

### Common Issues

1. **Node version mismatch**
   ```bash
   node --version  # Should be 18+
   ```

2. **Clear everything and start fresh**
   ```bash
   rm -rf node_modules .next
   npm install
   npm run dev
   ```

3. **Port conflicts**
   ```bash
   npm run dev -- -p 3001
   ```

### Contact Support

- CIC Support: support@cicinsurancegroup.com
- Developer: dev@cicinsurancegroup.com
- Website: https://ke.cicinsurancegroup.com

## ✅ Verification Checklist

Before reporting issues, verify:

- [ ] Node.js 18+ installed: `node --version`
- [ ] npm installed: `npm --version`
- [ ] Dependencies installed: `npm install`
- [ ] `.env.local` configured: `cat .env.local`
- [ ] Backend running on port 5000
- [ ] No port 3000 conflicts
- [ ] Browser console shows no errors
- [ ] Tried hard refresh: Ctrl+Shift+R

## 🎓 Learning Resources

### JavaScript/React

- [React 19 Docs](https://react.dev)
- [Modern JavaScript](https://javascript.info)
- [React Hooks Guide](https://react.dev/reference/react)

### Next.js

- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js Examples](https://github.com/vercel/next.js/tree/canary/examples)

### Tailwind CSS

- [Tailwind Documentation](https://tailwindcss.com/docs)
- [Tailwind Components](https://tailwindui.com)
- [Color Palette Generator](https://www.tailwindshades.com)

### TypeScript

- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- [React + TypeScript](https://react-typescript-cheatsheet.netlify.app)

## 📊 Project Status

- ✅ Frontend setup complete
- ✅ Components created
- ✅ Styling configured
- ✅ Type safety enabled
- ✅ Chat widget working
- ✅ Landing page ready
- ✅ Documentation complete

## 🚀 Ready to Deploy?

See [DEPLOYMENT_GUIDE.md](../docs/DEPLOYMENT_GUIDE.md) for:
- Vercel deployment
- Docker setup
- Environment configuration
- Performance optimization
- Monitoring setup

---

**Happy coding! 🎉**

Questions? Check the docs or reach out to support@cicinsurancegroup.com

**Version:** 1.0.0  
**Last Updated:** June 2026
