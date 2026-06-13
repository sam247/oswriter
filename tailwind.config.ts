import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)"
        },
        line: {
          DEFAULT: "var(--line)",
          strong: "var(--line-strong)"
        },
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
          subtle: "var(--ink-subtle)"
        },
        success: "var(--success)",
        warn: "var(--warn)",
        danger: "var(--danger)",
        info: "var(--info)"
      },
      borderRadius: {
        sm: "3px",
        md: "5px",
        lg: "7px"
      },
      fontFamily: {
        mono: ["var(--font-mono)"],
        sans: ["var(--font-sans)"]
      }
    }
  },
  plugins: []
};

export default config;
