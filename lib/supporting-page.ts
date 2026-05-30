type Box = { x: number; y: number; width: number; height: number };

const PAGE_WIDTH = 1500;
const PAGE_HEIGHT = 2100;
const MARGIN = 72;
const GAP = 34;

function toPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Supporting page could not be prepared.')), 'image/png');
  });
}
function layout(count: number): Box[] {
  const width = PAGE_WIDTH - MARGIN * 2;
  const height = PAGE_HEIGHT - MARGIN * 2;
  if (count <= 1) return [{ x: MARGIN, y: MARGIN, width, height }];
  if (count === 2) {
    const row = (height - GAP) / 2;
    return [{ x: MARGIN, y: MARGIN, width, height: row }, { x: MARGIN, y: MARGIN + row + GAP, width, height: row }];
  }
  if (count === 3) {
    const upper = Math.round(height * 0.3);
    const half = (width - GAP) / 2;
    return [
      { x: MARGIN, y: MARGIN, width: half, height: upper },
      { x: MARGIN + half + GAP, y: MARGIN, width: half, height: upper },
      { x: MARGIN, y: MARGIN + upper + GAP, width, height: height - upper - GAP }
    ];
  }
  const rows = Math.ceil(count / 2);
  const cellWidth = (width - GAP) / 2;
  const cellHeight = (height - GAP * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, index) => ({
    x: MARGIN + (index % 2) * (cellWidth + GAP),
    y: MARGIN + Math.floor(index / 2) * (cellHeight + GAP),
    width: cellWidth,
    height: cellHeight
  }));
}
export async function combineSupportingImages(files: File[]) {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image rendering is unavailable in this browser.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  const boxes = layout(files.length);
  for (let index = 0; index < files.length; index += 1) {
    const image = await createImageBitmap(files[index]);
    const box = boxes[index];
    const scale = Math.min(box.width / image.width, box.height / image.height);
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);
    context.drawImage(image, Math.round(box.x + (box.width - width) / 2), Math.round(box.y + (box.height - height) / 2), width, height);
    image.close();
  }
  return toPng(canvas);
}
