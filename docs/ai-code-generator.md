# 🤖 AI Code Generator for LetterGenerator

Automatically convert ChatGPT instructions into working code for the LetterGenerator repository.

## Features

✅ **Multiple Integration Methods**
- GitHub Actions (CI/CD triggered from issues/PRs)
- Local CLI tool for interactive development
- Issue templates for structured tasks

✅ **Smart Code Generation**
- Parses free-form ChatGPT conversations
- Detects code patterns and task types
- Generates TypeScript/React code
- Creates proper file structures

✅ **Git Automation**
- Automatic commit and push
- Meaningful commit messages
- Branch management

## Quick Start

### 1. Local CLI Usage

#### Simple command:
```bash
npm run ai:code "create a feature flag for the new FTC system"
```

#### Interactive mode:
```bash
npm run ai:code --interactive
```

#### From ChatGPT conversation:
```bash
npm run ai:code < chatgpt-conversation.txt
```

### 2. GitHub Issue (CI/CD)

Create an issue using the **"AI-Coded Feature"** template:

1. Go to **Issues** → **New Issue**
2. Select **"🤖 AI-Coded Feature"** template
3. Paste your ChatGPT instruction
4. Submit

The GitHub Action will automatically:
- Parse your instruction
- Generate code
- Commit changes
- Post a status comment

### 3. Comment Triggers

In any GitHub issue or PR, use one of these triggers:

```
/code: create a feature flag for authentication
@code-ai add a React component for user settings
[AI-CODE] fix the template rendering system
```

## Supported Code Generation

### Feature Flags
```bash
npm run ai:code "add feature flag for new feature X"
```
Generates: New entry in `lib/feature-flags.ts`

### React Components
```bash
npm run ai:code "create a component for user profile display"
```
Generates: New file in `components/` with React component

### Utility Functions
```bash
npm run ai:code "create a function for data validation"
```
Generates: New file in `lib/` with TypeScript function

### Type Definitions
```bash
npm run ai:code "define a type for user preferences"
```
Generates: New file in `lib/types/` with TypeScript type

### File Modifications
```bash
npm run ai:code "add authentication check to the main workflow"
```
Generates: Modification suggestions (requires review)

## How It Works

### 1. Instruction Processing
The AI Code Generator:
- Parses your ChatGPT conversation
- Detects task patterns
- Extracts context

### 2. Code Generation
Based on task type:
- **Feature Flag**: Updates `lib/feature-flags.ts`
- **Component**: Creates React component in `components/`
- **Function**: Creates utility in `lib/`
- **Type**: Creates type definition in `lib/types/`

### 3. Application
The system:
- Creates/modifies files
- Maintains code conventions
- Preserves existing code

### 4. Commit
- Stages changes with `git add`
- Creates meaningful commit message
- Pushes to current branch

## Examples

### Example 1: Add Feature Flag
**Instruction:**
```
create a feature flag for the new multi-language support system
```

**Output:**
- Updates `lib/feature-flags.ts`
- Adds `MULTI_LANGUAGE_SUPPORT` flag
- Auto-commit: "AI: create a feature flag for the new multi-language"

### Example 2: Generate Component
**Instruction:**
```
create a React component called LanguageSwitcher that displays a dropdown menu with language options
```

**Output:**
- Creates `components/LanguageSwitcher.tsx`
- Generates component with dropdown logic
- Auto-commit: "AI: create a React component called LanguageSwitcher"

### Example 3: From ChatGPT Conversation
**Instruction (from ChatGPT):**
```
User: How should I implement a caching system?
ChatGPT: You can create a cache manager that...

I want to create a cache manager utility that supports TTL and LRU eviction
```

**Output:**
- Creates `lib/cache-manager.ts`
- Implements caching logic
- Auto-commit: "AI: I want to create a cache manager utility"

## Configuration

Edit `.ai-code-config.json` to customize:

```json
{
  "enablement": {
    "autoCommit": true,
    "autoReview": false
  },
  "gitBehavior": {
    "branch": "main"
  },
  "templates": {
    "react_component": "components/",
    "utility_function": "lib/"
  }
}
```

## GitHub Action Workflow

The workflow triggers on:
- **Issue comments** containing trigger patterns
- **Pull request comments** with `/code:` or `@code-ai`
- **Manual workflow dispatch** via GitHub UI

### Workflow Steps:
1. Extract instruction from comment
2. Run `ai-code-processor.js`
3. Apply changes via `apply-changes.js`
4. Stage changes with `git add -A`
5. Commit with meaningful message
6. Push to current branch
7. Post status comment

## Script Reference

### `npm run ai:code <instruction>`
Process a single instruction and apply changes

Options:
- `--interactive` or `-i`: Enter instructions one at a time
- `--help` or `-h`: Show help message

### `npm run ai:code:interactive`
Interactive mode - prompts for instructions continuously

### `npm run ai:code:help`
Display help and usage examples

### `npm run ai:process <file>`
Process instruction file (raw output)

### `npm run ai:apply <result-file>`
Apply generated changes to repository

## Limitations

- **Max files per commit**: 10
- **Max lines per file**: 500 (auto-review if exceeded)
- **Auto-apply**: New files and modifications (not deletions)
- **Manual review**: Complex modifications always require review

## Troubleshooting

### "No valid coding tasks detected"
- Make your instruction more specific
- Include file names or function names
- Be clear about what you want

### "File already exists"
- The file is already in the repository
- Modify the instruction to reference existing files
- Or delete the file first if you want to recreate it

### "Script not found"
- Ensure you're in the LetterGenerator directory
- Run `npm install` first
- Check that `scripts/` folder exists

### Changes not applied
- Check that instructions are clear
- Review error messages in terminal
- Use interactive mode for step-by-step feedback

## Best Practices

1. **Be Specific**
   - ✅ "Create a utility function called `validateEmail` that checks for valid email format"
   - ❌ "Create a function"

2. **Include Context**
   - ✅ "Add a React component for displaying user notifications"
   - ❌ "Add a component"

3. **Use Clear Names**
   - ✅ "Feature flag for `NEW_DASHBOARD_UI`"
   - ❌ "Feature flag for thing"

4. **Paste Full ChatGPT Conversations**
   - The system can extract context from the full conversation
   - Include the question, answer, and any follow-up discussion

5. **Review Before Merging**
   - Always review generated code before merging
   - Check for edge cases and error handling
   - Ensure code follows project conventions

## GitHub Action Logs

View workflow runs at:
```
https://github.com/Arisu-art/LetterGenerator/actions
```

Look for `AI Code Generator` workflow runs to see:
- Parsed instructions
- Generated files
- Commits created
- Any errors

## Contributing to AI Code Generator

The generator is built from:
- `.github/workflows/ai-code-generator.yml` - GitHub Action
- `scripts/ai-code-processor.js` - Instruction parser and code generator
- `scripts/ai-coding-assistant.js` - Local CLI interface
- `scripts/apply-changes.js` - File writer and git handler
- `.ai-code-config.json` - Configuration

## FAQ

**Q: Can I use this for any type of code?**
A: Best for new files, components, utility functions, and type definitions. Complex file modifications may require manual review.

**Q: What if the generated code is wrong?**
A: You can review before merging and edit the generated code. The assistant will improve as you provide feedback.

**Q: Does this work offline?**
A: Yes, it's local. Just use `npm run ai:code "instruction"` with ChatGPT conversations you've already downloaded.

**Q: Can I disable auto-commit?**
A: Yes, edit `.ai-code-config.json` and set `"autoCommit": false`. Then you'll be prompted before committing.

**Q: Is this production-ready?**
A: It's a development tool. Always review generated code before merging to main. Recommended for feature development and refactoring.

## Security

- Code is generated locally
- No external API calls (beyond GitHub Actions)
- All code review and commit is transparent
- Access controlled via GitHub permissions

## Support

For issues or suggestions:
1. Check the troubleshooting section above
2. Review error messages in workflow logs
3. Create an issue with `[AI-CODE]` label

---

**Made with ❤️ for faster development**
