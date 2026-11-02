const MAX_LONG_EDGE = 2_000;
const TARGET_QUALITY = 0.82;

export type NormalizedImage = {
  file: File;
  width: number;
  height: number;
  byteSize: number;
};

function outputName(name: string) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "image"}.webp`;
}

async function decode(file: File) {
  // Decode the Blob directly when the browser supports it. This avoids a
  // temporary object URL, which a restrictive img-src CSP can block before the
  // browser exposes the decode failure as "The source image cannot be decoded."
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        image: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to element decoding so unsupported formats still report
      // the same error path.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      image: image as CanvasImageSource,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function normalizeBlogImage(file: File): Promise<NormalizedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  const source = await decode(file);
  try {
    const scale = Math.min(
      1,
      MAX_LONG_EDGE / Math.max(source.width, source.height),
    );
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot process images.");
    context.drawImage(source.image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Image encoding failed.")),
        "image/webp",
        TARGET_QUALITY,
      );
    });

    return {
      file: new File([blob], outputName(file.name), {
        type: "image/webp",
        lastModified: Date.now(),
      }),
      width,
      height,
      byteSize: blob.size,
    };
  } finally {
    source.release();
  }
}
