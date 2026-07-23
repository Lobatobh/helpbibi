import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Help Bibi — Socorro veicular quando você precisa',
  description: 'Solicite socorro veicular, acompanhe o atendimento e fale com o prestador em uma experiência segura e conectada.',
  keywords: ['auto socorro', 'guincho', 'reboque', 'socorro veicular', 'help bibi'],
  authors: [{ name: 'Help Bibi' }],
  icons: {
    icon: '/logo-help-bibi.png',
  },
  openGraph: {
    title: 'Help Bibi — Socorro veicular quando você precisa',
    description: 'Socorro automotivo conectado, com acompanhamento do atendimento.',
    siteName: 'Help Bibi',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Help Bibi',
    description: 'Socorro automotivo conectado, com acompanhamento do atendimento.',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} bg-background font-sans text-foreground antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="helpbibi-theme"
        >
          {children}
          <Toaster />
          <Sonner position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
