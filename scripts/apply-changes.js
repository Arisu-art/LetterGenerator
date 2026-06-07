#!/usr/bin/env node

/**
 * Apply Changes
 * Takes the JSON output from ai-code-processor and writes files to disk
 */

const fs = require('fs');
const path = require('path');

class ChangeApplier {
  constructor(projectRoot = path.resolve(__dirname, '..')) {
    this.projectRoot = projectRoot;
  }

  /**
   * Apply all changes from the processor result
   */
  applyChanges(resultFile) {
    try {
      const result = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
      
      if (!result.success) {
        console.error('❌ Processing failed:', result.errors.join('\n'));
        return false;
      }

      let appliedCount = 0;
      const failedChanges = [];

      for (const file of result.files) {
        try {
          const applied = this.applyChange(file);
          if (applied) {
            appliedCount++;
            console.log(`✅ ${file.description}`);
          }
        } catch (error) {
          failedChanges.push(`${file.description}: ${error.message}`);
          console.error(`❌ ${file.description}:`, error.message);
        }
      }

      if (appliedCount > 0) {
        console.log(`\n✅ Applied ${appliedCount} changes`);
      }

      if (failedChanges.length > 0) {
        console.log(`\n⚠️  ${failedChanges.length} changes failed`);
      }

      return appliedCount > 0;
    } catch (error) {
      console.error('❌ Error applying changes:', error.message);
      return false;
    }
  }

  /**
   * Apply a single change
   */
  applyChange(change) {
    const filePath = path.join(this.projectRoot, change.file);

    // Create directories if needed
    this.ensureDirectory(path.dirname(filePath));

    switch (change.type) {
      case 'CREATE':
        if (fs.existsSync(filePath)) {
          console.warn(`⚠️  File already exists: ${change.file}`);
          return false;
        }
        fs.writeFileSync(filePath, change.content, 'utf-8');
        return true;

      case 'MODIFY':
        if (!fs.existsSync(filePath)) {
          console.warn(`⚠️  File not found: ${change.file}`);
          return false;
        }
        
        if (change.insertAfter) {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (content.includes(change.code)) {
            console.warn(`⚠️  Code already present in ${change.file}`);
            return false;
          }
          
          const newContent = content.replace(
            change.insertAfter,
            `${change.insertAfter}\n${change.code}`
          );
          fs.writeFileSync(filePath, newContent, 'utf-8');
        } else if (change.content) {
          fs.writeFileSync(filePath, change.content, 'utf-8');
        }
        return true;

      case 'FIX':
      case 'SUGGESTION':
        // These are for manual review - not auto-applied
        console.log(`📝 Manual review needed: ${change.description}`);
        return false;

      default:
        console.warn(`⚠️  Unknown change type: ${change.type}`);
        return false;
    }
  }

  /**
   * Ensure directory exists
   */
  ensureDirectory(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// Main execution
async function main() {
  const resultFile = process.argv[2];
  
  if (!resultFile) {
    console.error('Usage: node apply-changes.js <result-file>');
    process.exit(1);
  }

  const applier = new ChangeApplier();
  const success = applier.applyChanges(resultFile);
  
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
