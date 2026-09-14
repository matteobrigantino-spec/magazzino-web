"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function GestionaleViewportFix() {
  const pathname = usePathname();

  useEffect(() => {
    const isCatalogo =
      pathname.startsWith("/catalogo");

    const isLogin =
      pathname === "/login";

    if (isCatalogo || isLogin) {
      return;
    }

    function resetHorizontalPosition() {
      window.scrollTo({
        left: 0,
        top: window.scrollY,
        behavior: "auto",
      });

      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;

      const shell =
        document.querySelector<HTMLElement>(
          ".gma-shell"
        );

      const workspace =
        document.querySelector<HTMLElement>(
          ".gma-workspace"
        );

      const content =
        document.querySelector<HTMLElement>(
          ".gma-content"
        );

      if (shell) {
        shell.scrollLeft = 0;
      }

      if (workspace) {
        workspace.scrollLeft = 0;
      }

      if (content) {
        content.scrollLeft = 0;
      }
    }

    resetHorizontalPosition();

    const firstTimer =
      window.setTimeout(
        resetHorizontalPosition,
        30
      );

    const secondTimer =
      window.setTimeout(
        resetHorizontalPosition,
        180
      );

    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(secondTimer);
    };
  }, [pathname]);

  return (
    <style jsx global>{`
      html:has(.gma-shell),
      body:has(.gma-shell) {
        width: 100%;
        max-width: 100%;
        overflow-x: hidden !important;
      }

      .gma-shell {
        width: 100% !important;
        min-width: 0 !important;
        grid-template-columns:
          190px
          minmax(0, 1fr) !important;
        overflow-x: clip !important;
      }

      .gma-sidebar {
        left: 0 !important;
        width: 190px !important;
        min-width: 190px !important;
        max-width: 190px !important;
        overflow-x: hidden !important;
      }

      .gma-workspace {
        width: 100% !important;
        min-width: 0 !important;
        overflow-x: hidden !important;
      }

      .gma-content {
        width: 100% !important;
        min-width: 0 !important;
        overflow-x: auto !important;
      }

      .gma-content-inner {
        min-width: 0 !important;
      }

      @media (max-width: 960px) {
        .gma-shell {
          display: block !important;
        }
      }
    `}</style>
  );
}
