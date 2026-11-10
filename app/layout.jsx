import { Inter } from 'next/font/google';
import Providers from '@/components/Providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata = {
  title: 'Trip Kitty',
  description: 'Group trip money manager: total budget, team, shared fund, bills with photos, activity log and settle-up.',
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232563eb'/%3E%3Cpath d='M11.5 12.3 13.3 7l3.3 4.5M20.5 12.3 18.7 7l-3.3 4.5' fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3Crect x='8' y='12' width='16' height='13' rx='3.4' fill='none' stroke='%23fff' stroke-width='2'/%3E%3Cpath d='M13.3 18.7h5.4' stroke='%23fff' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E",
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
  colorScheme: 'light',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
