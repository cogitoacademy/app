import type { BlogMediaDto } from "@cogito-app/api/modules/blog/blog.types";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import { normalizeBlogImage } from "@/lib/blog-image";
import { client } from "@/utils/orpc";

export async function uploadBlogImage(file: File): Promise<BlogMediaDto> {
  const normalized = await normalizeBlogImage(file);
  const signed = await client.upload.createUploadUrl({
    filename: normalized.file.name,
    contentType: "image/webp",
    contentLength: normalized.byteSize,
  });

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

  return client.adminBlog.registerMedia({
    storageKey: signed.key,
    filename: normalized.file.name,
    contentType: "image/webp",
    width: normalized.width,
    height: normalized.height,
    byteSize: normalized.byteSize,
  });
}

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
