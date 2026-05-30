'use client';

import SupportingDocumentsSetup from './SupportingDocumentsSetup';
import type { PacketAssets } from '../lib/packet-assets';

type Props = {
  round: string;
  storageKey: string;
  clientName: string;
  onChanged: (assets: PacketAssets) => void;
  onMessage: (message: string) => void;
};

export default function PacketAssemblySetup({ storageKey, clientName, onChanged, onMessage }: Props) {
  return <SupportingDocumentsSetup storageKey={storageKey} clientName={clientName} onChanged={onChanged} onMessage={onMessage} />;
}
