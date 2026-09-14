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
    <main className="relative mx-auto flex min-h-svh w-full flex-col p-4 sm:p-6 lg:p-8 justify-center">
      <div className="flex w-full items-center justify-center md:justify-between">
        <img
          src="/logo extended.png"
          alt="Cogito Academy"
          width={256}
          height={64}
          className="h-auto w-36 object-contain sm:w-32"
        />
        <div className="hidden">
          <ModeToggle />
        </div>
      </div>
      <section
        aria-label={showSignIn ? "Sign in" : "Sign up"}
        className="mx-auto flex w-full max-w-md md:flex-1 flex-col justify-start md:justify-center gap-6 mt-4"
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
    </main>
  );
}
