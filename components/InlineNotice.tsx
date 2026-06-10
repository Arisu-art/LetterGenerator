'use client';

import type { UiMessage } from '../lib/ui-message-contract';

type Props = {
  message: UiMessage;
};

export default function InlineNotice({ message }: Props) {
  return <section className={`inline-notice ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
    <div>
      <strong>{message.title}</strong>
      <p>{message.body}</p>
    </div>
    {message.action && <span>{message.action}</span>}
  </section>;
}
