# Contributing to x-post

Thank you for your interest in contributing to **x-post**! We welcome bug reports, feature requests, documentation improvements, and pull requests.

## Development Workflow

1. **Prerequisites**:
   - Install [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`).
   - Ensure Google Chrome / Chromium is installed.

2. **Setup**:
   ```bash
   git clone https://github.com/imMamdouhaboammar/x-post.git
   cd x-post
   ```

3. **Running Scripts**:
   ```bash
   # Test text post preview
   bun scripts/x-browser.ts "Test post"

   # Test unified CLI
   ./bin/x-post.js --help
   ```

4. **Skill Conductor Verification**:
   Ensure any changes to `SKILL.md` or references adhere to the Skill Conductor canon:
   - Body length < 500 lines.
   - Clear MOC structure with progressive disclosure pointers to `references/`.
   - Valid frontmatter description formula.

5. **Submitting Changes**:
   - Use conventional commit messages (`feat: ...`, `fix: ...`, `docs: ...`).
   - Push to your fork and open a Pull Request.
