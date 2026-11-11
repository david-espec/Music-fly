import { isBookEan } from './isbn';

interface Detector { detect(src: ImageBitmapSource): Promise<{ rawValue: string }[]> }

let detector: Promise<Detector> | null = null;

/**
 * Leitor de codigo de barras: usa o BarcodeDetector nativo (Chrome/Android)
 * e, onde nao existe (Safari, Firefox), um equivalente em WebAssembly (ZXing).
 */
function getDetector(): Promise<Detector> {
  if (!detector) {
    detector = (async () => {
      const Native = (window as unknown as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
      if (Native) {
        try {
          const fmts = await Native.getSupportedFormats();
          if (fmts.includes('ean_13')) return new Native({ formats: ['ean_13', 'ean_8', 'upc_a'] });
        } catch { /* usa o ponyfill */ }
      }
      const { BarcodeDetector } = await import('barcode-detector/ponyfill');
      return new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a'] }) as unknown as Detector;
    })();
    detector.catch(() => { detector = null; });
  }
  return detector;
}

/** Procura um ISBN (EAN-13 978/979) na imagem. */
export async function detectIsbn(src: ImageBitmapSource): Promise<string | null> {
  try {
    const d = await getDetector();
    const codes = await d.detect(src);
    return codes.map((c) => c.rawValue.replace(/\D/g, '')).find(isBookEan) ?? null;
  } catch {
    return null;
  }
}

/** Pre-carrega o leitor (evita atraso no primeiro quadro da camera). */
export const warmBarcode = () => { getDetector().catch(() => {}); };
