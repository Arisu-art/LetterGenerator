#!/usr/bin/env node

/**
 * AI Code Processor
 * Parses ChatGPT instructions and generates code changes for LetterGenerator
 * 
 * Usage: node scripts/ai-code-processor.js <instruction-file>
 */

const fs = require('fs');
const path = require('path');

// Instruction patterns - defines what types of coding tasks we can handle
const TASK_PATTERNS = {
  FILE_MODIFICATION: /(?:modify|update|fix|change|replace)\s+(?:file\s+)?(.+?)(?:\s+(?:to|with)|:\s+|by\s+)/i,
  FILE_CREATION: /(?:create|add|new)\s+(?:file\s+)?(.+?)(?:\s+(?:with|containing|that|for)|:\s+)/i,
  FUNCTION_CREATION: /(?:create|add|write|build)\s+(?:a\s+)?function\s+(?:called\s+)?(.+?)(?:\s+(?:that|to|which)|:\s+)/i,
  COMPONENT_FIX: /(?:fix|repair|improve)\s+(?:component|file)\s+(.+?)(?:\s+(?:by|to|for)|:\s+)/i,
  TYPE_DEFINITION: /(?:create|define|add)\s+type\s+(?:definition\s+for\s+)?(.+?)(?:\s+(?:with|containing|that)|:\s+)/i,
  FEATURE_FLAG: /(?:add|create|implement)\s+feature\s+flag(?:\s+for)?\s+(.+?)(?:\s+(?:to|with)|:\s+)/i
};

class AICodeProcessor {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.srcRoot = path.join(this.projectRoot, 'lib');
    this.componentsRoot = path.join(this.projectRoot, 'components');
  }

  /**
   * Main processing function
   */
  async processInstruction(instructionFile) {
    try {
      const instruction = fs.readFileSync(instructionFile, 'utf-8').trim();
      
      const result = {
        success: true,
        instruction: instruction.substring(0, 200),
        tasks: [],
        files: [],
        commands: [],
        errors: []
      };

      // Parse the instruction
      const tasks = this.parseInstruction(instruction);
      result.tasks = tasks;

      if (tasks.length === 0) {
        result.success = false;
        result.errors.push('No valid coding tasks detected in instruction');
        return result;
      }

      // Generate code for each task
      for (const task of tasks) {
        try {
          const fileChanges = await this.generateCode(task);
          result.files.push(...fileChanges);
        } catch (error) {
          result.errors.push(`Error processing task "${task.type}": ${error.message}`);
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        instruction: 'ERROR',
        tasks: [],
        files: [],
        errors: [error.message]
      };
    }
  }

  /**
   * Parse instruction into discrete tasks
   */
  parseInstruction(instruction) {
    const tasks = [];
    
    // Try to match known patterns
    for (const [patternName, pattern] of Object.entries(TASK_PATTERNS)) {
      const matches = instruction.matchAll(new RegExp(pattern.source, 'gi'));
      for (const match of matches) {
        tasks.push({
          type: patternName,
          subject: match[1]?.trim() || '',
          fullMatch: match[0],
          context: instruction
        });
      }
    }

    // If no patterns matched, treat whole thing as a feature request
    if (tasks.length === 0) {
      tasks.push({
        type: 'GENERAL_REQUEST',
        subject: instruction.split('\n')[0],
        fullMatch: instruction,
        context: instruction
      });
    }

    return tasks;
  }

  /**
   * Generate code based on task type
   */
  async generateCode(task) {
    const changes = [];

    switch (task.type) {
      case 'FEATURE_FLAG':
        changes.push(...this.generateFeatureFlag(task));
        break;
      case 'FUNCTION_CREATION':
        changes.push(...this.generateFunction(task));
        break;
      case 'FILE_CREATION':
        changes.push(...this.generateNewFile(task));
        break;
      case 'FILE_MODIFICATION':
        changes.push(...this.generateFileModification(task));
        break;
      case 'COMPONENT_FIX':
        changes.push(...this.generateComponentFix(task));
        break;
      case 'TYPE_DEFINITION':
        changes.push(...this.generateTypeDefinition(task));
        break;
      case 'GENERAL_REQUEST':
        changes.push(...this.generateFromDescription(task));
        break;
    }

    return changes;
  }

  /**
   * Generate feature flag code
   */
  generateFeatureFlag(task) {
    const flagName = task.subject.replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
    
    return [{
      type: 'MODIFY',
      file: 'lib/feature-flags.ts',
      description: `Add feature flag: ${flagName}`,
      code: `export type FeatureFlagName = 'FTC_IDENTITY_THEFT_REPORT' | '${flagName}';`,
      insertAfter: "export type FeatureFlagName = "
    }];
  }

  /**
   * Generate new function code
   */
  generateFunction(task) {
    const funcName = task.subject.replace(/[^a-zA-Z0-9]/g, '');
    
    const template = `
/**
 * ${task.subject}
 * 
 * Generated from AI instruction
 * @returns {void}
 */
export function ${funcName}() {
  // TODO: Implement ${task.subject}
  console.log('${funcName} called');
}
    `.trim();

    return [{
      type: 'CREATE',
      file: `lib/${funcName}.ts`,
      description: `Create function: ${funcName}`,
      content: template
    }];
  }

  /**
   * Generate new file
   */
  generateNewFile(task) {
    const fileName = task.subject.replace(/\s+/g, '-').toLowerCase();
    const className = task.subject.split(/[\s-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');

    const isComponent = /component|view|workspace|panel/i.test(task.context);
    const isLib = /utility|helper|function|service/i.test(task.context);

    let content = '';
    let file = '';

    if (isComponent) {
      file = `components/${className}.tsx`;
      content = `'use client';

import { type ReactNode } from 'react';

type Props = {
  children?: ReactNode;
};

export default function ${className}({ children }: Props) {
  return (
    <section className="${fileName}">
      <h2>${task.subject}</h2>
      {children}
    </section>
  );
}
`;
    } else if (isLib) {
      file = `lib/${fileName}.ts`;
      content = `/**
 * ${task.subject}
 * 
 * Generated from AI instruction
 */

export function ${this.toCamelCase(task.subject)}() {
  // TODO: Implement ${task.subject}
}
`;
    } else {
      file = `lib/${fileName}.ts`;
      content = `/**
 * ${task.subject}
 */

export {};
`;
    }

    return [{
      type: 'CREATE',
      file,
      description: `Create ${isComponent ? 'component' : 'file'}: ${task.subject}`,
      content
    }];
  }

  /**
   * Generate file modification
   */
  generateFileModification(task) {
    // This is more complex - would need to analyze existing files
    // For now, return a suggestion
    return [{
      type: 'MODIFY',
      file: task.subject,
      description: `Modify file: ${task.subject}`,
      needsReview: true,
      code: '// TODO: Review and apply modifications'
    }];
  }

  /**
   * Generate component fix
   */
  generateComponentFix(task) {
    // Find the component file
    const componentName = task.subject;
    
    return [{
      type: 'FIX',
      file: `components/${componentName}.tsx`,
      description: `Fix component: ${componentName}`,
      needsReview: true,
      notes: 'Review the component and make necessary fixes'
    }];
  }

  /**
   * Generate type definition
   */
  generateTypeDefinition(task) {
    const typeName = task.subject.split(/[\s-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    
    const typeTemplate = `
export type ${typeName} = {
  // TODO: Define properties for ${task.subject}
  id?: string;
  name?: string;
};
    `.trim();

    return [{
      type: 'CREATE',
      file: `lib/types/${this.toKebabCase(task.subject)}.ts`,
      description: `Define type: ${typeName}`,
      content: typeTemplate
    }];
  }

  /**
   * Generate from general description
   */
  generateFromDescription(task) {
    const suggestion = {
      type: 'SUGGESTION',
      description: task.subject,
      needsReview: true,
      notes: `Manual review needed for: ${task.subject.substring(0, 100)}`
    };

    return [suggestion];
  }

  // Utility functions
  toCamelCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
      index === 0 ? word.toLowerCase() : word.toUpperCase()
    ).replace(/\s+/g, '');
  }

  toKebabCase(str) {
    return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }
}

// Main execution
async function main() {
  const instructionFile = process.argv[2];
  
  if (!instructionFile) {
    console.error('Usage: node ai-code-processor.js <instruction-file>');
    process.exit(1);
  }

  const processor = new AICodeProcessor();
  const result = await processor.processInstruction(instructionFile);
  
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch(error => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
    stack: error.stack
  }, null, 2));
  process.exit(1);
});
