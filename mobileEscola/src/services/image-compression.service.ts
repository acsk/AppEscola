import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

export interface CompressionOptions {
  maxSizeKb?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface CompressedImageResult {
  uri: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number | null;
}

const DEFAULT_MAX_SIZE_KB = 50;
const DEFAULT_MAX_WIDTH = 1024;
const DEFAULT_MAX_HEIGHT = 1024;
const MIN_QUALITY = 0.2;

function getExtensionFromUri(uri: string): string {
  const cleaned = uri.split('?')[0] ?? uri;
  const parts = cleaned.split('.');
  const ext = parts[parts.length - 1]?.toLowerCase();
  if (!ext) return 'jpg';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return ext;
  return 'jpg';
}

function extensionToMimeType(extension: string): string {
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return 'image/jpeg';
}

async function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

async function getFileSizeBytes(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof info.size === 'number') {
      return info.size;
    }
  } catch {
    // Ignora para tentar fallback no fetch.
  }

  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    return blob.size;
  } catch {
    return null;
  }
}

export async function compressImageToMaxSize(
  uri: string,
  options: CompressionOptions = {}
): Promise<CompressedImageResult> {
  const maxSizeKb = options.maxSizeKb ?? DEFAULT_MAX_SIZE_KB;
  const maxSizeBytes = Math.max(1, maxSizeKb) * 1024;
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;

  const { width: originalWidth, height: originalHeight } = await getImageDimensions(uri);

  let width = originalWidth;
  let height = originalHeight;

  const scaleByWidth = maxWidth / width;
  const scaleByHeight = maxHeight / height;
  const initialScale = Math.min(1, scaleByWidth, scaleByHeight);

  if (initialScale < 1) {
    width = Math.round(width * initialScale);
    height = Math.round(height * initialScale);
  }

  let quality = 0.9;
  let bestUri = uri;
  let bestSize: number | null = await getFileSizeBytes(uri);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width, height } }],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    const size = await getFileSizeBytes(result.uri);

    bestUri = result.uri;
    bestSize = size;

    if (size !== null && size <= maxSizeBytes) {
      break;
    }

    if (quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.1);
      continue;
    }

    if (width <= 320 || height <= 320) {
      break;
    }

    width = Math.max(320, Math.round(width * 0.85));
    height = Math.max(320, Math.round(height * 0.85));
    quality = 0.82;
  }

  if (bestSize !== null && bestSize > maxSizeBytes) {
    throw new Error(`Não foi possível comprimir a imagem para no máximo ${maxSizeKb}kb.`);
  }

  const extension = getExtensionFromUri(bestUri);

  return {
    uri: bestUri,
    mimeType: extensionToMimeType(extension),
    fileName: `student-photo-${Date.now()}.${extension === 'gif' ? 'jpg' : extension}`,
    sizeBytes: bestSize,
  };
}
