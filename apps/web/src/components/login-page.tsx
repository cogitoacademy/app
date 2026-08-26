"use client";

import { useState } from "react";
import { useSearch } from "@tanstack/react-router";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export function LoginPage() {
  const [showSignIn, setShowSignIn] = useState(true);
  const { redirect } = useSearch({ from: "/login" });

  return (
    <main className="min-h-svh w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto grid w-full grid-cols-1 gap-4 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        <section
          aria-label="Cogito"
          className="relative flex min-h-32 items-center justify-center overflow-hidden rounded-[2rem] p-8 sm:min-h-40 lg:min-h-full"
          style={{
            background:
              "radial-gradient(circle at 50% -5%, color-mix(in oklab, var(--cogito-orange) 86%, transparent), transparent 36%), linear-gradient(160deg, color-mix(in oklab, var(--cogito-purple) 88%, var(--background)), color-mix(in oklab, var(--cogito-purple) 42%, var(--background)) 20%, var(--background) 58%)",
          }}
        >
          <img
            src="/cogito-academy-logo.webp"
            alt="Cogito Academy"
            className="relative z-10 h-auto w-52 max-w-full object-contain sm:w-64 lg:w-72"
          />
        </section>

        <section
          aria-label={showSignIn ? "Sign in" : "Sign up"}
          className="flex min-w-0 items-center justify-center [&_[data-slot=card]]:max-w-md [&_[data-slot=card]]:w-full!"
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
        </section>
      </div>
    </main>
  );
}
