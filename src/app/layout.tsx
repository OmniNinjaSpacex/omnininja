import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OmniNinja — Agente de IA Autônomo",
  description:
    "OmniNinja é uma plataforma de agente de IA autônomo com sandbox, terminal e navegador reais visíveis em tempo real. Multi-modelo (Claude, GPT, GLM, Gemini, Kimi), sistema de créditos e replay de sessões.",
  keywords: [
    "OmniNinja", "AI agent", "agente de IA", "autonomous agent", "Manus", "Ninja AI",
    "sandbox", "browser agent", "multi-modelo", "automação",
  ],
  authors: [{ name: "OmniNinja" }],
  openGraph: {
    title: "OmniNinja — Agente de IA Autônomo",
    description:
      "Plataforma de agente de IA autônomo com transparência total: sandbox, terminal e navegador reais visíveis em tempo real.",
    siteName: "OmniNinja",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OmniNinja — Agente de IA Autônomo",
    description: "Agente de IA autônomo com transparência total.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrains.variable} ${sourceSerif.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          {children}
          <Toaster />
          <SonnerToaster theme="dark" position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
