import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SocorroJá — Auto socorro por aplicativo",
  description: "Plataforma estilo Uber para socorro veicular. Cliente solicita, prestador mais próximo recebe a chamada e acompanha o serviço em tempo real até o destino final.",
  keywords: ["auto socorro", "guincho", "reboque", "app de socorro", "socorro veicular", "socorroja"],
  authors: [{ name: "SocorroJá" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "SocorroJá — Auto socorro por aplicativo",
    description: "Socorro automotivo na palma da mão, em tempo real.",
    siteName: "SocorroJá",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SocorroJá",
    description: "Socorro automotivo na palma da mão, em tempo real.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
