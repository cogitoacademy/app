"use client";

import { useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { TextLink } from "@cogito-app/ui/components/selia/text";

import { ModeToggle } from "@/components/mode-toggle";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export function LoginPage() {
  const [showSignIn, setShowSignIn] = useState(true);
  const { redirect } = useSearch({ from: "/login" });

  return (
    <main className="relative min-h-svh w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="absolute right-4 top-4 z-30 sm:right-6 sm:top-6 lg:right-8 lg:top-8 hidden">
        <ModeToggle />
      </div>
      <div className="mx-auto grid w-full grid-cols-1 gap-4 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        <section
          aria-label="Cogito"
          className="relative mx-auto flex min-h-0 w-full max-w-md items-start justify-start overflow-visible rounded-none bg-transparent p-0 lg:isolate lg:mx-0 lg:min-h-full lg:max-w-none lg:items-center lg:justify-center lg:overflow-hidden lg:rounded-[2rem] lg:bg-foreground lg:p-8"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 hidden rounded-[2rem] bg-foreground lg:block"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at 0% 100%, color-mix(in oklab, var(--background) 70%, var(--cogito-orange)) 0%, color-mix(in oklab, var(--cogito-orange) 38%, transparent) 24%, transparent 46%), radial-gradient(ellipse at 16% 106%, color-mix(in oklab, var(--cogito-orange) 100%, transparent) 0%, color-mix(in oklab, var(--cogito-orange) 42%, transparent) 28%, transparent 56%), linear-gradient(145deg, transparent 0%, color-mix(in oklab, var(--background) 14%, transparent) 100%), repeating-linear-gradient(105deg, color-mix(in oklab, var(--background) 5%, transparent) 0 1px, transparent 1px 11px)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 hidden lg:block"
          >
            <div
              className="absolute -bottom-[20%] left-[-10%] h-[48%] w-[72%] rounded-full opacity-70 blur-3xl"
              style={{
                background:
                  "radial-gradient(ellipse, color-mix(in oklab, var(--cogito-orange) 92%, transparent) 0%, color-mix(in oklab, var(--cogito-orange) 42%, transparent) 38%, transparent 72%)",
              }}
            />
            <span
              className="absolute bottom-[-10%] left-[5%] h-[36%] w-[12%] rotate-[2deg] rounded-t-[3rem] opacity-75 blur-[9px]"
              style={{
                background:
                  "linear-gradient(to top, color-mix(in oklab, var(--cogito-orange) 94%, transparent), color-mix(in oklab, var(--cogito-orange) 54%, transparent) 52%, transparent)",
              }}
            />
            <span
              className="absolute bottom-[-12%] left-[21%] h-[52%] w-[12%] rotate-[-1deg] rounded-t-[3rem] opacity-95 blur-[5px]"
              style={{
                background:
                  "linear-gradient(to top, color-mix(in oklab, var(--cogito-orange) 98%, transparent), color-mix(in oklab, var(--cogito-orange) 70%, transparent) 46%, transparent)",
              }}
            />
            <span
              className="absolute bottom-[-12%] left-[37%] h-[62%] w-[11%] rotate-[1deg] rounded-t-[2.5rem] opacity-90 blur-[4px]"
              style={{
                background:
                  "linear-gradient(to top, color-mix(in oklab, var(--cogito-orange) 96%, transparent), color-mix(in oklab, var(--cogito-orange) 64%, transparent) 44%, transparent)",
              }}
            />
            <span
              className="absolute bottom-[-12%] left-[52%] h-[46%] w-[13%] rotate-[-2deg] rounded-t-[3rem] opacity-75 blur-[7px]"
              style={{
                background:
                  "linear-gradient(to top, color-mix(in oklab, var(--cogito-orange) 94%, transparent), color-mix(in oklab, var(--cogito-orange) 52%, transparent) 50%, transparent)",
              }}
            />
            <span
              className="absolute bottom-[-10%] left-[70%] h-[32%] w-[12%] rotate-[2deg] rounded-t-[3rem] opacity-60 blur-[10px]"
              style={{
                background:
                  "linear-gradient(to top, color-mix(in oklab, var(--cogito-orange) 90%, transparent), color-mix(in oklab, var(--cogito-orange) 42%, transparent) 48%, transparent)",
              }}
            />
            <div
              className="absolute inset-x-0 bottom-0 h-[30%] opacity-30"
              style={{
                background:
                  "linear-gradient(to top, color-mix(in oklab, var(--cogito-orange) 26%, transparent), transparent)",
              }}
            />
          </div>
          <img
            src="/logo extended.png"
            alt="Cogito Academy"
            width={256}
            height={64}
            className="relative z-10 ml-1.5 h-auto w-40 max-w-full object-contain object-left sm:w-56 lg:absolute lg:left-10 lg:top-10 lg:ml-0 lg:w-64"
          />
        </section>

        <section
          aria-label={showSignIn ? "Sign in" : "Sign up"}
          className="flex min-w-0 items-center justify-center [&_[data-slot=card]]:max-w-md [&_[data-slot=card]]:w-full! flex-col"
        >
          {showSignIn ? (
            <SignInForm
              onSwitchToSignUp={() => setShowSignIn(false)}
              redirectPath={redirect}
            />
          ) : (
            <SignUpForm
              onSwitchToSignIn={() => setShowSignIn(true)}
              redirectPath={redirect}
            />
          )}
          <p className="max-w-md px-4 text-center text-dimmed text-xs leading-relaxed">
            By continuing, you agree to Cogito Digital&apos;s{" "}
            <TextLink
              href="https://cogitoacademy.id/en/privacy-policy"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy
            </TextLink>{" "}
            and{" "}
            <TextLink
              href="https://cogitoacademy.id/en/terms-of-service"
              target="_blank"
              rel="noreferrer"
            >
              Terms of Service
            </TextLink>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
