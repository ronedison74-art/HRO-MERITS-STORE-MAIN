import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import { ToastProvider } from '@/components/Toast'
import { AuthProvider } from '@/lib/auth'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Merit Store System · HR Department',
      },
      {
        name: 'description',
        content: 'Merit Store — record cadet privilege availments and process merit deductions.',
      },
    ],
    links: [
      { rel: 'icon', type: 'image/png', href: '/fleet-logo.png' },
      { rel: 'apple-touch-icon', href: '/fleet-logo.png' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap',
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
        <Scripts />
      </body>
    </html>
  )
}
