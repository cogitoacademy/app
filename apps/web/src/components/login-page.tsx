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
    <main className="relative min-h-svh w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 flex items-center">
      <div className="absolute right-4 top-4 z-30 sm:right-6 sm:top-6 lg:right-8 lg:top-8 hidden">
        <ModeToggle />
      </div>
      <div className="mx-auto grid w-full grid-cols-1">
        <section
          aria-label={showSignIn ? "Sign in" : "Sign up"}
          className="flex min-w-0 items-center justify-center [&_[data-slot=card]]:max-w-md [&_[data-slot=card]]:w-full! flex-col"
        >
          <img
            src="/logo extended.png"
            alt=""
            width={256}
            height={64}
            className="relative z-10 h-auto w-36 max-w-full mx-auto object-contain object-left sm:w-42 lg:ml-0 "
          />
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
