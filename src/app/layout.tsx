import type { Metadata } from "next";
import { Cormorant_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RichardTheBruce — He who creates",
  description:
    "Personal dev portfolio of Richard Wayne. Founder of Nuro Finance. Scalar physicist. String theorist. Particle architect.",
  openGraph: {
    title: "RichardTheBruce — He who creates",
    description:
      "Founder of Nuro Finance. Agentic finance across 23 chains. Master of strings, particles, and probability.",
    type: "website",
    url: "https://richardthebruce.dev",
  },
  twitter: {
    card: "summary_large_image",
    title: "RichardTheBruce — He who creates",
    description: "Founder. Scalar physicist. Particle architect.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-ink text-bone font-sans antialiased selection:bg-amber/30">
        {children}
      </body>
    </html>
  );
}
