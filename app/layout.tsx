import './globals.css';
import './workspace-light.css';
import './workspace-dashboard.css';
import './workspace-polish.css';
import './sidebar-visible.css';
import './output-review.css';
import './live-editor.css';
import './experience-upgrade.css';
import './attention-states.css';
import './source-normalization.css';

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
