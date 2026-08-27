"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";
import { IconArrowLeft } from "@tabler/icons-react";
import type { ReactNode } from "react";

function GradientCode({ code }: { code: string }) {
  return (
    <svg
      viewBox="0 0 800 300"
      className="w-full max-w-[20rem] select-none sm:max-w-md"
      aria-hidden="true"
    >
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-cogito-orange/20 stroke-cogito-orange font-black tracking-tighter"
        style={{ fontSize: "20rem" }}
        strokeWidth="2"
        strokeDasharray="40 20"
      >
        {code}
      </text>
    </svg>
  );
}

interface ErrorPageContentProps {
  code: string;
  title: string;
  description: string;
  titleId: string;
  children?: ReactNode;
}

export function ErrorPageContent({
  code,
  title,
  description,
  titleId,
  children,
}: ErrorPageContentProps) {
  return (
    <section
      aria-labelledby={titleId}
      className="z-10 mx-auto flex w-full max-w-lg flex-col items-center text-center"
    >
      <GradientCode code={code} />

      <div className="flex flex-col items-center gap-2">
        <Heading
          id={titleId}
          className="text-xl leading-snug font-bold tracking-tight sm:text-2xl"
        >
          {title}
        </Heading>
        <Text className="mx-auto max-w-xs text-sm leading-relaxed text-muted sm:max-w-sm sm:text-base">
          {description}
        </Text>
      </div>

      {children}
    </section>
  );
}

export function ErrorPage() {
  return (
    <main
      aria-labelledby="error-page-title"
      className="relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-8 sm:px-6"
    >
      <title>Something went wrong · Cogito Academy</title>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 size-96 rounded-full bg-cogito-orange/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 size-[30rem] rounded-full bg-cogito-purple/10 blur-3xl" />
      </div>

      <ErrorPageContent
        code="500"
        title="Something went wrong"
        description="We couldn't load this page. Please go back and try again."
        titleId="error-page-title"
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
