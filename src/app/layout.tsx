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
  title: "OmniNinja AI",
  description:
    "OMNINJA é um agente de IA com pesquisa, navegador, arquivos e execução isolada em um único workspace.",
  keywords: [
    "OmniNinja", "OMNINJA", "AI agent", "agente de IA", "automação", "sandbox", "browser agent",
  ],
  authors: [{ name: "OmniNinja" }],
  openGraph: {
    title: "OmniNinja AI",
    description: "Uma inteligência. Infinitas habilidades.",
    siteName: "OmniNinja AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OmniNinja AI",
    description: "Uma inteligência. Infinitas habilidades.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrains.variable} ${sourceSerif.variable} font-sans antialiased bg-background text-foreground`}>
        <ThemeProvider>
          {children}
          <Toaster />
          <SonnerToaster theme="dark" position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
