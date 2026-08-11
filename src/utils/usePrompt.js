// usePrompt.js
import { useEffect } from "react";
import { useBeforeUnload } from "react-router-dom";

export function usePrompt(message, when) {
  // For tab close / refresh
  useBeforeUnload((e) => {
    if (when) {
      e.preventDefault();
      e.returnValue = message;
    }
  });

  // For back/forward buttons
  useEffect(() => {
    const handlePopState = (e) => {
      if (when && !window.confirm(message)) {
        e.preventDefault();
        window.history.pushState(null, "", window.location.pathname);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [when, message]);
}
