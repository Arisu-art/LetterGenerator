# 🚀 AI Code Generator - Quick Start

## Installation

The AI Code Generator is included with LetterGenerator. No additional installation needed!

```bash
cd /workspaces/LetterGenerator
npm install  # If not already done
```

## 3 Ways to Use It

### 1️⃣ **Command Line (Fastest)**

```bash
npm run ai:code "create a feature flag for dark mode"
npm run ai:code "generate a React component for settings"
npm run ai:code "add a utility function for data validation"
```

### 2️⃣ **Interactive Mode**

```bash
npm run ai:code --interactive
```

Then type instructions one at a time:
```
> create a hook for form validation
> add error handling to the FTC system
> exit
```

### 3️⃣ **GitHub Issue (Auto CI/CD)**

1. Go to **Issues** → **New Issue**
2. Choose **"🤖 AI-Coded Feature"** template
3. Paste your ChatGPT instruction
4. Watch it auto-generate and commit!

---

## Real Examples

### ✨ Create a Component
```bash
npm run ai:code "create a React component called NotificationBell that shows a badge with unread count"
```

**Generated:**
```
✅ components/NotificationBell.tsx
- React component with notifications
- Badge showing count
- Ready to use!
```

### ✨ Add a Utility Function
```bash
npm run ai:code "create a utility function called formatCurrency that formats numbers as USD currency"
```

**Generated:**
```
✅ lib/formatCurrency.ts
- Exports formatCurrency() function
- Handles rounding and formatting
- Includes TypeScript types
```

### ✨ Generate a Feature Flag
```bash
npm run ai:code "add feature flag for experimental AI features"
```

**Generated:**
```
✅ lib/feature-flags.ts updated
- New EXPERIMENTAL_AI_FEATURES flag added
- Integrated with existing feature system
```

---

## ChatGPT Integration

### Copy from ChatGPT & Paste

Save your ChatGPT conversation:
```bash
npm run ai:code < my-chatgpt-conversation.txt
```

Or pipe directly:
```bash
cat > instruction.txt << 'EOF'
User: How do I implement a caching system?
ChatGPT: You can use...

I want to create a cache manager with TTL support
EOF

npm run ai:code < instruction.txt
```

### GitHub Comment Triggers

In any GitHub issue or PR:

```
/code: create a utility for file validation
@code-ai add a React component for user profile
[AI-CODE] fix the payment processing system
```

The bot will automatically generate and commit!

---

## What Gets Generated

The AI Code Generator can automatically create:

✅ **React Components**
- Functional components
- Hooks
- Type-safe props
- CSS class names

✅ **Utility Functions**
- TypeScript functions
- Error handling
- JSDoc comments
- Type exports

✅ **Type Definitions**
- TypeScript interfaces
- Type aliases
- Proper exports
- Documentation

✅ **Feature Flags**
- Flag definitions
- Enable/disable logic
- Configuration integration

✅ **File Modifications**
- Code additions
- Property updates
- Import statements

---

## Tips & Tricks

### 💡 Be Specific
```bash
# ✅ Good
npm run ai:code "create a DatePicker component that accepts min/max dates"

# ❌ Vague
npm run ai:code "make a date thing"
```

### 💡 Include Context
```bash
# ✅ With context
npm run ai:code "add a validation function for email addresses in the auth module"

# ❌ Without context
npm run ai:code "add a validation function"
```

### 💡 Use Existing Names
```bash
# ✅ Reference existing files
npm run ai:code "update template-exhibits.ts to support FTC reports"

# ❌ New vague names
npm run ai:code "update some file"
```

### 💡 Combine Instructions
From ChatGPT, you can paste entire conversations and the AI will extract the relevant parts.

---

## What Happens Behind the Scenes

1. **Parse** → Reads your instruction
2. **Analyze** → Detects what type of code to generate
3. **Generate** → Creates TypeScript/React code
4. **Preview** → Shows what will be created
5. **Confirm** → Asks before applying changes
6. **Apply** → Writes files to disk
7. **Commit** → Creates git commit
8. **Push** → Pushes to repository (optional)

---

## Keyboard Shortcuts (Interactive Mode)

| Key | Action |
|-----|--------|
| `Up Arrow` | Previous instruction |
| `Down Arrow` | Next instruction |
| `Tab` | Auto-complete |
| `Ctrl+C` | Exit |

---

## Troubleshooting

### ❓ "No valid coding tasks detected"
Make your instruction more specific with actual names and descriptions.

### ❓ "File already exists"
The file is already in the repo. Modify your instruction or delete the file first.

### ❓ "Permission denied"
Run `chmod +x scripts/*.js` to make scripts executable.

### ❓ "npm: command not found"
Make sure Node.js is installed. Check with `node --version`.

---

## Configuration

Edit `.ai-code-config.json` to customize:

```json
{
  "enablement": {
    "autoCommit": true,     // Auto-commit changes
    "autoReview": false     // Require manual review
  },
  "gitBehavior": {
    "branch": "main"        // Target branch
  }
}
```

---

## Help & Documentation

```bash
npm run ai:code --help          # Show full help
npm run ai:code:interactive     # Interactive mode
```

Full docs: [docs/ai-code-generator.md](../docs/ai-code-generator.md)

---

## Examples to Try Right Now

```bash
# 1. Create a component
npm run ai:code "create a Footer component with links and copyright info"

# 2. Make a utility
npm run ai:code "add a function that converts markdown to HTML"

# 3. Add a type
npm run ai:code "create a User type with name, email, and roles"

# 4. Try interactive
npm run ai:code --interactive
```

---

## Got Questions?

- 📖 Read the [full documentation](../docs/ai-code-generator.md)
- 🐛 Check [troubleshooting section](../docs/ai-code-generator.md#troubleshooting)
- 💬 Use `/code:` in GitHub issues for help
- ✨ Examples: See [examples section](../docs/ai-code-generator.md#examples)

---

## 🎉 You're Ready!

Start coding with ChatGPT and let the AI handle the implementation:

```bash
npm run ai:code "your idea here"
```

Happy coding! 🚀
