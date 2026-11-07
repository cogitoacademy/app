import type { BlogMediaDto } from "@cogito-app/api/modules/blog/blog.types";
import { uploadImage } from "@/lib/upload-image";
import { client } from "@/utils/orpc";

export async function uploadBlogImage(file: File): Promise<BlogMediaDto> {
  const image = await uploadImage(file);

  return client.adminBlog.registerMedia({
    storageKey: image.key,
    filename: image.file.name,
    contentType: "image/webp",
    width: image.width,
    height: image.height,
    byteSize: image.byteSize,
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
