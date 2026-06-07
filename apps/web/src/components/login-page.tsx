"use client";

import { useState } from "react";
import { useSearch } from "@tanstack/react-router";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export function LoginPage() {
  const [showSignIn, setShowSignIn] = useState(true);
  const { redirect } = useSearch({ from: "/login" });

  return showSignIn ? (
    <SignInForm
      onSwitchToSignUp={() => setShowSignIn(false)}
      redirectPath={redirect}
    />
  ) : (
    <SignUpForm
      onSwitchToSignIn={() => setShowSignIn(true)}
      redirectPath={redirect}
    />
  );
}
