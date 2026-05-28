import { useCallback, useEffect, useState } from "react";

export function useFullscreen() {
  const [active, setActive] = useState(false);

  const sync = useCallback(() => {
    setActive(document.fullscreenElement === document.documentElement);
  }, []);

  const enter = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      setActive(true);
    } catch {
      // Browser may block until user gesture — ignore.
    }
  }, []);

  const exit = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    setActive(false);
  }, []);

  const toggle = useCallback(async () => {
    if (document.fullscreenElement) {
      await exit();
    } else {
      await enter();
    }
  }, [enter, exit]);

  useEffect(() => {
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [sync]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyF") {
        event.preventDefault();
        void toggle();
      }
      if (event.code === "Escape" && document.fullscreenElement) {
        setActive(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return { active, enter, exit, toggle };
}
