export type CompressImageOptions = {
  maxSizeKb?: number;
  initialQuality?: number;
  minQuality?: number;
  qualityStep?: number;
  maxDimension?: number;
};

const DEFAULT_OPTIONS: Required<CompressImageOptions> = {
  maxSizeKb: 100,
  initialQuality: 0.9,
  minQuality: 0.5,
  qualityStep: 0.1,
  maxDimension: 1600,
};

function isBrowserImageContext() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof Image !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined"
  );
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível carregar a imagem."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Não foi possível gerar a imagem comprimida."));
      },
      "image/jpeg",
      quality
    );
  });
}

function getExtension(filename: string) {
  const match = filename.match(/\.[^.]+$/);
  return match?.[0] ?? ".jpg";
}

export async function compressImageToMaxSize(
  file: File,
  options: CompressImageOptions = {}
): Promise<File | Blob> {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const maxBytes = settings.maxSizeKb * 1024;

  if (file.size <= maxBytes || !isBrowserImageContext()) {
    return file;
  }

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return file;
  }

  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  let width = originalWidth;
  let height = originalHeight;
  let quality = settings.initialQuality;
  let lastBlob: Blob | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const scale = Math.min(1, settings.maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    context.clearRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await canvasToBlob(canvas, quality);
    lastBlob = blob;

    if (blob.size <= maxBytes) {
      return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    }

    if (quality > settings.minQuality) {
      quality = Math.max(settings.minQuality, quality - settings.qualityStep);
    } else {
      width = Math.round(targetWidth * 0.85);
      height = Math.round(targetHeight * 0.85);
    }
  }

  if (lastBlob) {
    return new File([lastBlob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  }

  return file;
}

export async function prepareImageForUpload(file: File, maxSizeKb = 100) {
  return compressImageToMaxSize(file, { maxSizeKb });
}
