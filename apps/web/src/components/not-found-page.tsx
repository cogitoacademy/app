"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import { IconArrowLeft } from "@tabler/icons-react";

import { ErrorPageContent } from "@/components/error-page";

export function NotFoundPage() {
  return (
    <main
      aria-labelledby="not-found-title"
      className="relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-8 sm:px-6"
    >
      <title>Page not found · Cogito Academy</title>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 size-96 rounded-full bg-cogito-orange/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 size-[30rem] rounded-full bg-cogito-purple/10 blur-3xl" />
      </div>

      <ErrorPageContent
        code="404"
        title="No, no, that's right."
        description="This is a 404 page. And this page exists, no matter what anyone says."
        titleId="not-found-title"
      >
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            variant="tertiary"
            onClick={() => window.history.back()}
          >
            <IconArrowLeft />
            Go back
          </Button>
        </div>
      </ErrorPageContent>
    </main>
  );
}
