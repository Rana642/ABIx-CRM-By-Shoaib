import './globals.css';

export const metadata = {
  title: 'Aya — AI Executive OS',
  description: 'ABIx Group portfolio command centre',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background font-body-md text-body-md text-on-surface antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
