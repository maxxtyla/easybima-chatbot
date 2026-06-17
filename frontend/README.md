# CIC Insurance Chatbot - Frontend

A modern Next.js 15 + React 19 + TypeScript frontend for the CIC Insurance chatbot with Tailwind CSS styling.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env.local
```

Update `.env.local` with your API URL (default is `http://localhost:5000`).

### 3. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` in your browser.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Check TypeScript types

## Project Structure

```
src/
├── app/              # Next.js app router pages
├── components/       # React components
│   └── chat/        # Chat widget components
├── hooks/           # Custom React hooks
├── lib/             # Utilities and API client
├── types/           # TypeScript type definitions
└── styles/          # Global styles
```

## Color Palette (CIC Brand)

| Color | Hex | Class |
|-------|-----|-------|
| Primary Red | #AC202D | `bg-cic-red` |
| Dark Gray | #111111 | `bg-cic-gray` |
| Light Gray | #F9FAFB | `bg-cic-light` |
| White | #FFFFFF | `bg-cic-white` |

## Features

- ✨ Chat widget with floating button
- 📱 Fully responsive design
- 🎨 CIC brand colors integrated
- 🔄 Real-time message updates
- 💾 Session persistence
- ♿ Accessible components
- 📦 TypeScript throughout

## Documentation

See [FRONTEND_SETUP_GUIDE.md](../docs/FRONTEND_SETUP_GUIDE.md) for detailed documentation including:
- Component architecture
- Configuration guide
- Deployment instructions
- Troubleshooting tips

## API Integration

The frontend communicates with the backend API at `process.env.NEXT_PUBLIC_API_URL`.

### Endpoints Used

- `POST /api/chat/v2` - Send message and get response
- `GET /health` - Check API health

### Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_CHAT_ENABLED=true
NEXT_PUBLIC_CHAT_POSITION=bottom-right
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- iOS Safari
- Android Chrome

## Development Tips

### Hot Reload

The development server supports fast refresh. Changes to components automatically reload.

### TypeScript

Run type checking before committing:

```bash
npm run type-check
```

### Linting

Check code style:

```bash
npm run lint
```

### Debugging

Use browser DevTools or VS Code debugger with:
- React DevTools extension
- Next.js debugging guide in docs

## Troubleshooting

**Widget not showing?**
- Check `z-index: z-50`
- Verify CSS loaded in globals.css
- Ensure ChatWidget is in page

**API not connecting?**
- Verify NEXT_PUBLIC_API_URL is correct
- Check backend is running on port 5000
- Look for CORS issues

**Styling issues?**
- Clear `.next/` folder: `rm -rf .next`
- Restart dev server
- Check tailwind.config.ts

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [React 19 Documentation](https://react.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)

## License

© 2026 CIC Insurance Group
