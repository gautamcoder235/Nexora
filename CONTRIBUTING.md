# Contributing to Nexora

Thank you for your interest in contributing to **Nexora**! We welcome contributions from the community to help build a world-class AI coding assistant and desktop application.

---

## Code of Conduct

All contributors are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating in community interactions.

---

## Development Setup

### Prerequisites
- **Node.js** v18 or higher & `npm` / `pnpm`
- **Rust** 1.75+ (via `rustup`)
- **C++ Build Tools** (for Windows/Tauri compilation)

### Initializing the Workspace

```bash
# 1. Clone the repository
git clone https://github.com/gautamcoder235/Nexora.git
cd Nexora

# 2. Install frontend dependencies
npm install

# 3. Create your local environment file
cp .env.example .env

# 4. Check Rust workspace & frontend types
cargo check --workspace
npm run lint
```

---

## Running the Desktop Application

```bash
# Start dev server & Tauri application
npm run dev
```

---

## Pull Request Guidelines

1. **Fork & Branch:** Create a feature branch from `main` (`feature/your-feature-name` or `fix/your-fix-name`).
2. **Type Safety & Build Checks:** Ensure `npm run lint` (`tsc --noEmit`) and `cargo check --workspace` pass without errors.
3. **Commit Messages:** Use clear, descriptive commit messages.
4. **Submitting PR:** Open a Pull Request against the `main` branch using our PR template.

---

## Security Policy

If you discover a security vulnerability or exposed key, please **do not** open a public issue. Instead, report it directly to the repository maintainer.
