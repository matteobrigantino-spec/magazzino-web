@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #111111;
  --card: #f3f4f6;
  --card-2: #e5e7eb;
  --table-head: #d1d5db;
  --border-color: #cbd5e1;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #000000;
    --foreground: #ffffff;
    --card: #0f172a;
    --card-2: #1e293b;
    --table-head: #334155;
    --border-color: #475569;
  }
}

html,
body {
  margin: 0;
  padding: 0;
  min-height: 100%;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

* {
  box-sizing: border-box;
