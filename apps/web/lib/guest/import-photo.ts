const MAX_FILE_BYTES = 25 * 1024 * 1024;

const messages = {
  notImage: "Ce fichier n'est pas une photo. Choisissez une image.",
  tooLarge: "Cette photo est trop lourde. Choisissez-en une de moins de 25 Mo.",
  unreadable: "Nous n'arrivons pas à lire cette photo. Essayez-en une autre.",
};

export type ImportResult = { photo: Blob } | { error: string };

function isHeic(file: File) {
  return /\.hei[cf]$/i.test(file.name) || /image\/hei[cf]/.test(file.type);
}

/** Decoding is what proves a file is a readable picture, whatever its name. */
async function canDecode(photo: Blob) {
  try {
    const bitmap = await createImageBitmap(photo);
    bitmap.close();
    return true;
  } catch {
    return false;
  }
}

/** Heavy, and only needed by browsers that cannot read iPhone photos. */
async function heicToJpeg(file: File): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg" });
  return Array.isArray(converted) ? converted[0] : converted;
}

export async function importPhoto(file: File): Promise<ImportResult> {
  if (!file.type.startsWith("image/") && !isHeic(file)) {
    return { error: messages.notImage };
  }
  if (file.size > MAX_FILE_BYTES) return { error: messages.tooLarge };

  if (await canDecode(file)) return { photo: file };

  if (isHeic(file)) {
    try {
      return { photo: await heicToJpeg(file) };
    } catch {
      return { error: messages.unreadable };
    }
  }
  return { error: messages.unreadable };
}
