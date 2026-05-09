"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";

import * as React from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl && typeof window !== "undefined") {
  console.warn(
    "NEXT_PUBLIC_CONVEX_URL is not set — plan history and saving will fail until it is configured.",
  );
}

const convex = convexUrl ?? "";

const convexClient = new ConvexReactClient(convex);

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConvexProvider client={convexClient}>{children}</ConvexProvider>;
}
