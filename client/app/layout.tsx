import type { Metadata } from "next";
import { EB_Garamond, Lato } from "next/font/google";
import "./globals.css";

const bodyFont = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  display: "swap",
  variable: "--font-body",
});

const headingFont = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Pedidos registrais | Aferisai",
  description: "Exemplo de criação e acompanhamento de pedidos registrais Aferisai",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${bodyFont.variable} ${headingFont.variable}`}>{children}</body>
    </html>
  );
}
