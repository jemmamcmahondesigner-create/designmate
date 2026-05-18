"use client";

import { useCallback, useEffect, useState } from "react";

export function useResendCooldown(seconds = 60) {
  const [cooldown, setCooldown] = useState(0);

  const startCooldown = useCallback(() => {
    setCooldown(seconds);
  }, [seconds]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  return {
    cooldown,
    startCooldown,
    canResend: cooldown <= 0,
  };
}
