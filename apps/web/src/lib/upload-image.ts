import { normalizeBlogImage, type NormalizedImage } from "./blog-image";
import { resolveProfileImageUrl } from "./profile-image-url";
import { client } from "@/utils/orpc";

export type UploadedImage = NormalizedImage & {
  key: string;
  url: string;
};

export async function uploadImage(file: File): Promise<UploadedImage> {
  const normalized = await normalizeBlogImage(file);
  const signed = await client.upload.createUploadUrl({
    filename: normalized.file.name,
    contentType: "image/webp",
    contentLength: normalized.byteSize,
  });

  if (normalized.byteSize > signed.maxBytes) {
    throw new Error("Image is larger than 5 MB after resizing.");
  }

  const uploadUrl =
    resolveProfileImageUrl(signed.uploadUrl) ?? signed.uploadUrl;
  const isLocalUpload = signed.uploadUrl.startsWith("/");
  const fields = signed.fields ?? {};
  let response: Response;

  if (Object.keys(fields).length > 0) {
    const body = new FormData();
    Object.entries(fields).forEach(([key, value]) => body.append(key, value));
    body.append("file", normalized.file, normalized.file.name);
    response = await fetch(uploadUrl, { method: signed.method, body });
  } else {
    response = await fetch(uploadUrl, {
      method: signed.method,
      credentials: isLocalUpload ? "include" : "omit",
      headers: { "content-type": normalized.file.type },
      body: normalized.file,
    });
  }

  if (!response.ok) throw new Error("Image upload failed.");

  return {
    ...normalized,
    key: signed.key,
    url: resolveProfileImageUrl(signed.publicUrl) ?? signed.publicUrl,
  };
}
