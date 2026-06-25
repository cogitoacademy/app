export const openApiTags = [
  { name: "Achievements", description: "Student achievements CRUD" },
  { name: "Admin", description: "Admin-only operations" },
  {
    name: "Admin Tutors",
    description: "Admin tutor management (invites & profiles)",
  },
  { name: "Auth", description: "Authentication & user profiles" },
  { name: "Invites", description: "Tutor invite verification & claiming" },
  { name: "System", description: "Health checks & system info" },
  { name: "Tutor", description: "Tutor profile management" },
  { name: "Tutors", description: "Public tutor browsing" },
];

export function enrichOpenAPISpec<
  T extends { tags?: unknown; paths?: unknown },
>(spec: T) {
  const enriched = structuredClone(spec) as T & {
    tags: typeof openApiTags;
    paths?: Record<string, unknown>;
  };
  enriched.tags = openApiTags;
  if (enriched.paths) {
    enriched.paths = Object.fromEntries(
      Object.entries(enriched.paths).toSorted(([a], [b]) => a.localeCompare(b)),
    );
  }

  return enriched;
}

export function scalarHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cogito API Reference</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', {
        // The URL of the OpenAPI/Swagger document
        url: '/openapi.json',
      })
    </script>
  </body>
</html>`;
}
