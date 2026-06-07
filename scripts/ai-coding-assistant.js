#!/usr/bin/env node

/**
 * AI Coding Assistant CLI
 * Process ChatGPT instructions and apply them directly to the repository
 * 
 * Usage:
 *   npm run ai:code "fix the FTC feature flag system"
 *   npm run ai:code < chatgpt-conversation.txt
 *   npm run ai:code --interactive
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Import the processor
const processorPath = path.join(__dirname, 'ai-code-processor.js');

class AICodingAssistant {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Main CLI entry point
   */
  async run() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
      this.showHelp();
      return;
    }

    if (args.includes('--interactive')) {
      await this.interactiveMode();
    } else if (args.length > 0 && args[0] !== '--') {
      await this.processInstruction(args.join(' '));
    } else {
      await this.stdinMode();
    }

    this.rl.close();
  }

  /**
   * Interactive mode - prompts for instructions
   */
  async interactiveMode() {
    console.log('🤖 AI Coding Assistant - Interactive Mode');
    console.log('Type your ChatGPT instruction and press Enter.');
    console.log('Type "exit" to quit.\n');

    const question = (prompt) => new Promise(resolve => this.rl.question(prompt, resolve));

    while (true) {
      const instruction = await question('> ');
      
      if (instruction.toLowerCase() === 'exit') {
        console.log('👋 Goodbye!');
        break;
      }

      if (instruction.trim()) {
        await this.processInstruction(instruction);
      }
    }
  }

  /**
   * Read from stdin mode
   */
  async stdinMode() {
    return new Promise((resolve) => {
      let data = '';
      
      process.stdin.on('data', chunk => {
        data += chunk;
      });

      process.stdin.on('end', async () => {
        if (data.trim()) {
          await this.processInstruction(data);
        }
        resolve();
      });
    });
  }

  /**
   * Process a single instruction
   */
  async processInstruction(instruction) {
    console.log('\n📝 Processing instruction...');
    console.log(`Instruction: "${instruction.substring(0, 100)}${instruction.length > 100 ? '...' : ''}"\n`);

    try {
      // Write instruction to temp file
      const tempFile = path.join(this.projectRoot, '.tmp-instruction.txt');
      fs.writeFileSync(tempFile, instruction);

      // Run processor
      console.log('🔍 Analyzing instruction...');
      const processorScript = path.join(__dirname, 'ai-code-processor.js');
      const result = JSON.parse(
        execSync(`node "${processorScript}" "${tempFile}"`, {
          encoding: 'utf-8',
          stdio: 'pipe'
        })
      );

      // Clean up temp file
      fs.unlinkSync(tempFile);

      if (!result.success) {
        console.error('❌ Processing failed:', result.errors.join('\n'));
        return;
      }

      console.log(`✅ Detected ${result.tasks.length} task(s):\n`);
      result.tasks.forEach((task, i) => {
        console.log(`  ${i + 1}. ${task.type}: ${task.subject}`);
      });

      console.log(`\n📝 Generated changes:\n`);
      result.files.forEach((file, i) => {
        console.log(`  ${i + 1}. [${file.type}] ${file.file}`);
        console.log(`     ${file.description}`);
        if (file.needsReview) {
          console.log('     ⚠️  Needs manual review');
        }
      });

      // Ask for confirmation
      const confirmed = await this.confirmChanges();
      
      if (confirmed) {
        // Write result to temp file for apply-changes
        const resultFile = path.join(this.projectRoot, '.tmp-result.json');
        fs.writeFileSync(resultFile, JSON.stringify(result));

        // Apply changes
        console.log('\n📝 Applying changes...');
        const applierScript = path.join(__dirname, 'apply-changes.js');
        try {
          execSync(`node "${applierScript}" "${resultFile}"`, {
            stdio: 'inherit'
          });

          // Clean up
          fs.unlinkSync(resultFile);

          // Commit changes
          const commitConfirmed = await this.confirmCommit();
          if (commitConfirmed) {
            await this.commitChanges(instruction);
          }
        } catch (error) {
          console.error('❌ Error applying changes:', error.message);
        }
      } else {
        console.log('⏭️  Skipping changes');
      }
    } catch (error) {
      if (error.message.includes('ENOENT')) {
        console.error('❌ Script not found. Make sure you are in the LetterGenerator directory.');
      } else {
        console.error('❌ Error:', error.message);
      }
    }
  }

  /**
   * Ask user to confirm changes
   */
  async confirmChanges() {
    return new Promise((resolve) => {
      this.rl.question('\nApply these changes? (yes/no) [no]: ', (answer) => {
        resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
      });
    });
  }

  /**
   * Ask user to confirm commit
   */
  async confirmCommit() {
    return new Promise((resolve) => {
      this.rl.question('Commit and push changes? (yes/no) [yes]: ', (answer) => {
        const confirmed = answer.toLowerCase() !== 'no' && answer.toLowerCase() !== 'n';
        resolve(confirmed);
      });
    });
  }

  /**
   * Commit changes to git
   */
  async commitChanges(instruction) {
    try {
      console.log('\n📝 Committing changes...');

      const commitMsg = `AI: ${instruction.substring(0, 50)}${instruction.length > 50 ? '...' : ''}

Generated from ChatGPT instruction via AI Coding Assistant`;

      execSync('git add -A', { cwd: this.projectRoot, stdio: 'pipe' });
      execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { 
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.projectRoot,
        encoding: 'utf-8'
      }).trim();

      execSync(`git push origin ${branch}`, {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      console.log('✅ Changes committed and pushed!');
    } catch (error) {
      console.error('❌ Git error:', error.message);
    }
  }

  /**
   * Show help message
   */
  showHelp() {
    console.log(`
🤖 AI Coding Assistant for LetterGenerator

Usage:
  npm run ai:code "your instruction here"
  npm run ai:code < file.txt
  npm run ai:code --interactive

Examples:
  npm run ai:code "create a new utility function for FTC"
  npm run ai:code "fix the template system"
  npm run ai:code "add feature flag for new feature"

Options:
  --interactive, -i   Interactive mode - enter instructions one at a time
  --help, -h          Show this help message

The tool will:
  1. Parse your instruction
  2. Generate TypeScript code
  3. Ask for confirmation
  4. Apply changes to your repository
  5. Commit and push (optionally)

Tips:
  - Be specific with your instructions
  - Include file names when relevant
  - ChatGPT conversations can be pasted directly
    `);
  }
}

// Main execution
if (require.main === module) {
  const assistant = new AICodingAssistant();
  assistant.run().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = AICodingAssistant;
