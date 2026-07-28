/**
 * Esporta un elemento <svg> già renderizzato (QR code o GS1 DataMatrix) come file
 * scaricabile, in formato SVG vettoriale o PNG rasterizzato. Funziona identicamente per
 * qualunque codice a barre reso come SVG nel DOM, senza dipendere dalla libreria che lo
 * ha generato (angularx-qrcode o bwip-js).
 */

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function serializeSvg(svg: SVGElement): string {
  const clone = svg.cloneNode(true) as SVGElement;
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  return new XMLSerializer().serializeToString(clone);
}

export function downloadBarcodeSvg(container: HTMLElement, filename: string): void {
  const svg = container.querySelector('svg');
  if (!svg) return;
  const source = serializeSvg(svg);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, filename);
}

export function downloadBarcodePng(container: HTMLElement, filename: string, pixelSize = 640): void {
  const svg = container.querySelector('svg');
  if (!svg) return;
  const source = serializeSvg(svg);
  const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = pixelSize;
    canvas.height = pixelSize;
    const ctx = canvas.getContext('2d');
    URL.revokeObjectURL(url);
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pixelSize, pixelSize);
    ctx.drawImage(img, 0, 0, pixelSize, pixelSize);
    canvas.toBlob((blob) => {
      if (blob) triggerDownload(blob, filename);
    }, 'image/png');
  };
  img.src = url;
}
