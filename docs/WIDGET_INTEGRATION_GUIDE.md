# Chat Widget Integration Guide

## Overview

The CIC Insurance Chat Widget can be embedded into any website or application. This guide explains different integration methods.

## Integration Methods

### Method 1: Next.js Application (Recommended)

For Next.js applications, the widget is fully integrated by default.

```tsx
// In your page.tsx
import { ChatWidget } from '@/components/chat/ChatWidget'

export default function YourPage() {
  return (
    <main>
      {/* Your page content */}
      <ChatWidget />
    </main>
  )
}
```

### Method 2: Standalone Script Embedding

For non-Next.js websites, you can embed the chat widget as a standalone script.

#### Step 1: Build the Widget

Create a standalone build script in the frontend:

```bash
npm run build
```

#### Step 2: Deploy Static Files

Deploy the `.next/static` folder to your CDN or server.

#### Step 3: Add Script to Your HTML

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Website</title>
</head>
<body>
    <!-- Your website content -->

    <!-- CIC Chat Widget -->
    <script>
        // Initialize chat widget
        (function() {
            const script = document.createElement('script');
            script.src = 'https://your-domain.com/chat-widget.js';
            script.async = true;
            script.defer = true;
            document.body.appendChild(script);
        })();
    </script>
</body>
</html>
```

### Method 3: iframe Embedding

For maximum isolation, embed the chat in an iframe:

```html
<iframe
    id="cic-chat-widget"
    src="https://your-domain.com/chat"
    style="
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 400px;
        height: 500px;
        border: none;
        border-radius: 12px;
        box-shadow: 0 5px 40px rgba(0, 0, 0, 0.16);
        z-index: 9999;
    "
></iframe>
```

### Method 4: React Component Import

If your project uses React:

```bash
npm install @cic/chat-widget
```

```tsx
import { ChatWidget } from '@cic/chat-widget'

export default function App() {
  return (
    <>
      <div>Your content here</div>
      <ChatWidget apiUrl="https://api.cicinsurancegroup.com" />
    </>
  )
}
```

## Configuration Options

### Environment Variables

```env
# Required
NEXT_PUBLIC_API_URL=https://api.cicinsurancegroup.com

# Optional
NEXT_PUBLIC_CHAT_ENABLED=true
NEXT_PUBLIC_CHAT_POSITION=bottom-right
NEXT_PUBLIC_CHAT_WIDTH=400
NEXT_PUBLIC_CHAT_HEIGHT=500
NEXT_PUBLIC_BRAND_COLOR=#AC202D
```

### Component Props

```tsx
<ChatWidget
  apiUrl="https://api.example.com"
  position="bottom-right"
  width={400}
  height={500}
  theme="light"
  enabled={true}
  headerTitle="CIC Support"
  onOpen={() => console.log('Chat opened')}
  onClose={() => console.log('Chat closed')}
/>
```

## Styling Customization

### Override Default Colors

```css
:root {
  --cic-primary: #AC202D;
  --cic-dark: #8B1A25;
  --cic-light: #F9FAFB;
  --cic-gray: #111111;
}
```

### Custom Theme

```tsx
<ChatWidget
  theme={{
    primaryColor: '#AC202D',
    textColor: '#111111',
    backgroundColor: '#F9FAFB',
    borderRadius: '12px',
    fontFamily: 'Inter, sans-serif',
  }}
/>
```

## API Configuration

### Backend Endpoint

The widget expects the following backend endpoint:

```
POST /api/chat/v2
Content-Type: application/json

{
  "sessionId": "unique-session-id",
  "userMessage": "User's message here"
}

Response:
{
  "sessionId": "unique-session-id",
  "message": "Assistant's response",
  "timestamp": 1234567890
}
```

### Health Check

```
GET /health

Response:
{
  "status": "ok",
  "timestamp": 1234567890
}
```

## Security Considerations

### CORS Configuration

Ensure your backend allows requests from the frontend domain:

```javascript
// Express.js example
app.use(cors({
  origin: ['https://your-domain.com', 'http://localhost:3000'],
  credentials: true,
}))
```

### API Key Protection

If using API keys, never expose them in frontend code:

```tsx
// ✅ Good - handled by backend
const response = await fetch('/api/chat/v2', {
  method: 'POST',
  body: JSON.stringify({ sessionId, userMessage }),
})

// ❌ Bad - exposes API key
const response = await fetch('https://api.claude.ai/v1/messages', {
  headers: { 'Authorization': `Bearer ${API_KEY}` },
})
```

### Session Security

- Sessions are stored in localStorage
- Consider adding session expiration
- Validate sessionId on backend
- Use HTTPS in production

## Performance Optimization

### Lazy Loading

```tsx
import dynamic from 'next/dynamic'

const ChatWidget = dynamic(
  () => import('@/components/chat/ChatWidget'),
  { ssr: false }
)
```

### Code Splitting

The chat widget is automatically code-split in Next.js.

### Bundle Size

Approximate sizes:
- Gzipped JS: ~25KB
- CSS: ~5KB
- Total: ~30KB

## Browser Compatibility

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | Latest | ✅ Full |
| Firefox | Latest | ✅ Full |
| Safari | Latest | ✅ Full |
| Edge | Latest | ✅ Full |
| IE 11 | 11 | ⚠️ Partial |

## Mobile Considerations

### Responsive Breakpoints

```css
/* Mobile - optimized layout */
@media (max-width: 640px) {
  .chat-widget {
    width: 100%;
    height: 100vh;
    bottom: 0;
    right: 0;
    border-radius: 0;
  }
}

/* Desktop - floating widget */
@media (min-width: 641px) {
  .chat-widget {
    width: 400px;
    height: 500px;
    bottom: 20px;
    right: 20px;
    border-radius: 12px;
  }
}
```

### Touch Optimization

- Larger touch targets (minimum 44x44px)
- No hover states on mobile
- Swipe gestures supported
- Full-screen mode on small screens

## Accessibility

### WCAG Compliance

The widget meets WCAG 2.1 AA standards:
- Keyboard navigation (Tab, Enter, Escape)
- Screen reader support (ARIA labels)
- High contrast colors
- Focus indicators visible

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Tab | Navigate to next element |
| Shift+Tab | Navigate to previous element |
| Enter | Send message or select item |
| Escape | Close chat widget |

## Troubleshooting

### Widget Not Displaying

**Problem:** Chat widget button not visible

**Solutions:**
1. Check z-index conflicts: `z-index: 50 !important`
2. Verify CSS loading
3. Check browser console for errors
4. Ensure `ChatWidget` component is rendered

### API Connection Failed

**Problem:** Cannot connect to backend

**Solutions:**
1. Verify `NEXT_PUBLIC_API_URL`
2. Check CORS configuration
3. Ensure backend is running
4. Test with: `curl -X GET https://api.example.com/health`
5. Check network tab in DevTools

### Styling Conflicts

**Problem:** Widget styles not applying

**Solutions:**
1. Use CSS specificity: `.chat-widget { ... !important }`
2. Load widget CSS after page styles
3. Use CSS scoping/isolation
4. Check for style sheets overriding Tailwind

### Session Issues

**Problem:** Messages not persisting

**Solutions:**
1. Check localStorage is enabled
2. Verify `NEXT_PUBLIC_SESSION_STORAGE` setting
3. Clear browser storage and reload
4. Check backend session management

## Examples

### WordPress Integration

```html
<!-- In footer.php before </body> -->
<script>
  (function() {
    const script = document.createElement('script');
    script.src = 'https://chat.cicinsurancegroup.com/widget.js';
    script.async = true;
    document.body.appendChild(script);
  })();
</script>
```

### Shopify Integration

Create a Shopify app or use theme editor:

```liquid
{% if shop.name == "CIC Insurance" %}
  <script src="https://chat.cicinsurancegroup.com/widget.js" async defer></script>
{% endif %}
```

### Vue.js Integration

```vue
<template>
  <div id="app">
    <ChatWidget
      :api-url="apiUrl"
      :enabled="true"
      @open="onChatOpen"
      @close="onChatClose"
    />
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import ChatWidget from '@cic/chat-widget'

export default defineComponent({
  components: { ChatWidget },
  data() {
    return {
      apiUrl: 'https://api.cicinsurancegroup.com'
    }
  },
  methods: {
    onChatOpen() {
      console.log('Chat opened')
    },
    onChatClose() {
      console.log('Chat closed')
    }
  }
})
</script>
```

### Angular Integration

```typescript
import { Component } from '@angular/core'

@Component({
  selector: 'app-root',
  template: `
    <div id="chat-widget"></div>
  `
})
export class AppComponent {
  ngAfterViewInit() {
    const script = document.createElement('script')
    script.src = 'https://chat.cicinsurancegroup.com/widget.js'
    script.async = true
    document.body.appendChild(script)
  }
}
```

## Deployment Checklist

- [ ] Backend API deployed and accessible
- [ ] CORS configured correctly
- [ ] Environment variables set
- [ ] HTTPS enabled
- [ ] SSL certificate valid
- [ ] DNS records pointing correctly
- [ ] Widget tested in all target browsers
- [ ] Mobile responsiveness verified
- [ ] Performance optimized (Lighthouse > 90)
- [ ] Analytics integrated
- [ ] Error monitoring configured
- [ ] Documentation updated

## Support & Contact

For integration assistance:
- Email: support@cicinsurancegroup.com
- Phone: +254 (0)20 426 1000
- Website: https://ke.cicinsurancegroup.com
- Developer Portal: https://dev.cicinsurancegroup.com

---

**Last Updated:** June 2026  
**Version:** 1.0.0
