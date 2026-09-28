"use client";

import { BrandMark } from "@/src/components/brand/BrandMark";

export function AboutApp() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 sui-app px-8 text-center">
      <BrandMark size={72} />
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] sui-muted">Kairo</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight sui-title">About Kairo</h3>
        <p className="mt-2 max-w-sm text-sm leading-6 sui-muted">
          A high-performance remote computer platform for managing servers, terminals, and live desktop applications from the browser.
        </p>
      </div>
    </div>
  );
}
