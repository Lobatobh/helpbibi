import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Help Bibi — Auto socorro por aplicativo",
  description: "Plataforma estilo Uber para socorro veicular. Cliente solicita, prestador mais próximo recebe a chamada e acompanha o serviço em tempo real até o destino final.",
  keywords: ["auto socorro", "guincho", "reboque", "app de socorro", "socorro veicular", "help bibi", "ajuda carro"],
  authors: [{ name: "Help Bibi" }],
  icons: {
    icon: "/help-bibi-logo.png",
  },
  openGraph: {
    title: "Help Bibi — Auto socorro por aplicativo",
    description: "Socorro automotivo na palma da mão, em tempo real.",
    siteName: "Help Bibi",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Help Bibi",
    description: "Socorro automotivo na palma da mão, em tempo real.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <Toaster />
          <Sonner
            position="top-center"
            richColors
            closeButton
            toastOptions={{
              style: {
                background: '#0f172a',
                border: '1px solid #1e293b',
                color: '#f1f5f9',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
