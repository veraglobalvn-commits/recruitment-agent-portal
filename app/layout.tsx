import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bangladesh Agent Portal - Vietnam Recruitment',
  description: 'Vera Global Agent Portal',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
