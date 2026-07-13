export type LoginSearch = {
  redirect?: string;
};

export function validateLoginSearch(
  search: Record<string, string>,
): LoginSearch {
  const redirect = search.redirect;
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
    return { redirect };
  }
  return {};
}
