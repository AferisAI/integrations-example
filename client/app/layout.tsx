import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aferisai OAuth",
  description: "Exemplo de integração OAuth com Aferisai",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
