import './globals.css';

export const metadata = {
  title: 'Aya CRM',
  description: 'ABIx Group portfolio CRM dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
