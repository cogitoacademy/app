export type LoginSearch = {
  redirect?: string;
};

export function validateLoginSearch(search: Record<string, string>): LoginSearch {
  const redirect = search.redirect;
  return redirect ? { redirect } : {};
}
