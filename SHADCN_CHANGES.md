# shadcn/ui Integration – Change Log

Branch: `STYLEMOCK`

---

## 1. Packages Installed

```bash
npm install class-variance-authority clsx tailwind-merge lucide-react @radix-ui/react-label @radix-ui/react-slot
```

| Package                    | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `class-variance-authority` | Defines component variant classes (CVA)              |
| `clsx`                     | Conditional class merging                            |
| `tailwind-merge`           | Removes Tailwind class conflicts on merge            |
| `lucide-react`             | Icon library used throughout the Login UI            |
| `@radix-ui/react-label`    | Accessible label primitive for the `Label` component |
| `@radix-ui/react-slot`     | `asChild` slot pattern for the `Button` component    |

---

## 2. Configuration Changes

### `frontend/vite.config.js`

- Added `resolve.alias` so `@/` maps to `./src/`, enabling the `@/components/ui/...` import path shadcn uses.

```js
resolve: {
  alias: { '@': path.resolve(__dirname, './src') },
},
```

### `frontend/jsconfig.json` _(new file)_

- Adds the same `@/*` path alias for IDE autocomplete / type-checking.

### `frontend/src/index.css`

- Removed the `@theme inline` CSS variable token block that was sourcing light-mode colors and breaking all dark-theme renders.
- Removed the light `--background`, `--card`, `--muted-foreground`, etc. variables.
- Set `color-scheme: dark` and `background-color: #0f172a` (slate-950).
- Removed `padding` from `#root` so the full-viewport login layout renders correctly.

---

## 3. New shadcn/ui Component Files

All files live under `frontend/src/components/ui/`.

### `button.jsx`

Variants powered by CVA:

| `variant`     | Style                               |
| ------------- | ----------------------------------- |
| `default`     | Solid indigo (`bg-indigo-600`)      |
| `outline`     | Transparent with `border-slate-600` |
| `secondary`   | `bg-slate-700`                      |
| `ghost`       | No background, hover slate          |
| `destructive` | `bg-red-600`                        |
| `link`        | Underline text in indigo            |

Sizes: `default` (h-10), `sm` (h-9), `lg` (h-11), `icon` (h-10 w-10).  
Supports `asChild` via `@radix-ui/react-slot`.

### `input.jsx`

Replaces bare `<input>`. Base classes:

- `bg-slate-700/50 border-slate-600 text-white`
- `placeholder:text-slate-400`
- `focus-visible:ring-2 focus-visible:ring-indigo-500`
- Transition on all colors

### `label.jsx`

Wraps `@radix-ui/react-label`. Base class: `text-sm font-medium text-slate-300`. Supports `peer-disabled` states.

### `card.jsx`

Exports: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.  
Default card style: `bg-slate-800 border-slate-700 text-white rounded-xl shadow-xl`.

---

## 4. Utility

### `frontend/src/lib/utils.js` _(new file)_

```js
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
```

Used by every UI component to safely merge Tailwind classes.

---

## 5. `Login.jsx` – Full Rewrite

### What changed

| Before                                     | After                                                      |
| ------------------------------------------ | ---------------------------------------------------------- |
| Custom CSS classes from `Login.css`        | Pure Tailwind + shadcn components                          |
| Raw `<input>` / `<label>` / `<button>`     | `Input`, `Label`, `Button` from `@/components/ui`          |
| `<div className="login-card">`             | `Card` + `CardHeader` + `CardContent` + `CardFooter`       |
| No icons                                   | `lucide-react` icons on every field                        |
| Light-mode CSS variable colors bleeding in | Explicit `slate-*` / `indigo-*` dark palette throughout    |
| `padding` on `#root` clipping layout       | `min-h-screen` full-viewport div, `#root` padding set to 0 |

### shadcn elements used in Login

| Element                  | Component                                                                         | Where                             |
| ------------------------ | --------------------------------------------------------------------------------- | --------------------------------- |
| Login / Register card    | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | Auth form wrapper                 |
| Guest join card          | Same `Card` set                                                                   | Below auth card (login mode only) |
| Email, Name, Code inputs | `Input`                                                                           | All text fields                   |
| Field labels             | `Label`                                                                           | Above each `Input`                |
| Submit button            | `Button` (default variant)                                                        | Form submit                       |
| Guest join button        | `Button` (outline variant)                                                        | Guest section                     |
| Error banners            | Custom `div` with `AlertCircle` (lucide)                                          | Inline error states               |

### Icons used (lucide-react)

| Icon             | Used on                            |
| ---------------- | ---------------------------------- |
| `MonitorPlay`    | Brand logo                         |
| `Mail`           | Email field                        |
| `Lock`           | Password / Confirm password fields |
| `User`           | Name field (register)              |
| `Eye` / `EyeOff` | Show/hide password toggle          |
| `Loader2`        | Spinner on loading buttons         |
| `AlertCircle`    | Error messages                     |
