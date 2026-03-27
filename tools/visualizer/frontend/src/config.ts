/**
 * Global configuration for the visualizer.
 * Set HF_ORG via environment variable (VITE_HF_ORG) at build time,
 * or override at runtime by setting window.__HF_ORG__.
 */

export const HF_ORG: string =
  (typeof window !== "undefined" && (window as any).__HF_ORG__) ||
  import.meta.env.VITE_HF_ORG ||
  "your-org";
