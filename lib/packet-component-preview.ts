export type PacketComponentPreview = {
  step: string;
  label: string;
  state: 'ready' | 'empty';
  pdf: Blob | null;
  note: string;
};
