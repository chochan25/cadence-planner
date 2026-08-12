"use client";

import * as React from "react";

import {
  LOCAL_PLANS_KEY,
  MAX_LOCAL_PLANS,
  readLocalPlans,
  type SavedPlan,
} from "@/lib/local-plans";
import type { FeedbackItem } from "@/lib/plan";

function persist(plans: SavedPlan[]) {
  try {
    window.localStorage.setItem(LOCAL_PLANS_KEY, JSON.stringify(plans));
  } catch {
    // Keep the current session usable when storage is blocked or full.
  }
}

export function useLocalPlans() {
  const [plans, setPlans] = React.useState<SavedPlan[] | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setPlans(readLocalPlans(window.localStorage.getItem(LOCAL_PLANS_KEY)));
      } catch {
        setPlans([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const savePlan = React.useCallback((plan: Omit<SavedPlan, "id">) => {
    const id = crypto.randomUUID();
    const saved = { ...plan, id };
    setPlans((current) => {
      const next = [saved, ...(current ?? [])].slice(0, MAX_LOCAL_PLANS);
      persist(next);
      return next;
    });
    return id;
  }, []);

  const saveFeedback = React.useCallback(
    (planId: string, feedback: FeedbackItem[]) => {
      setPlans((current) => {
        if (!current) return current;
        const next = current.map((plan) =>
          plan.id === planId ? { ...plan, feedback } : plan,
        );
        persist(next);
        return next;
      });
    },
    [],
  );

  return { plans, savePlan, saveFeedback };
}
