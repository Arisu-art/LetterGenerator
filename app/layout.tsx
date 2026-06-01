import './globals.css';
import './workspace-light.css';
import './workspace-dashboard.css';
import './workspace-polish.css';
import './sidebar-visible.css';
import './output-review.css';
import './live-editor.css';
import './ordered-packet-content.css';
import './editor-pagination.css';
import './final-packets.css';
import './experience-upgrade.css';
import './attention-states.css';
import './source-normalization.css';
import './packet-ui.css';
import './template-flow.css';
import './templates-header-inline.css';
import './template-classification.css';
import './progressive-disclosure.css';
import './template-premium.css';
import './global-minimal-ui.css';
import './workflow-premium.css';
import './guided-source-flow.css';
import './output-guided-flow.css';
import './packet-editor-precision.css';
import './shared-transitions.css';
import './packet-editor-recovery.css';
import './packet-editor-focused.css';
import './packet-editor-consolidated.css';

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
