import './globals.css';
import './workspace-light.css';
import './workspace-dashboard.css';

export const metadata = {
  title: 'LetterGenerator',
  description: 'Precision DOCX letter automation'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
