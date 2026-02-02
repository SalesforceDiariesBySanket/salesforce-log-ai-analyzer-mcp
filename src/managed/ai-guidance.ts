/**
 * @module managed/ai-guidance
 * @description Generate AI-focused guidance for managed package issues
 * @status COMPLETE
 * @see src/managed/STATE.md
 * @dependencies src/types/managed.ts, src/types/issues.ts, src/types/events.ts
 * @lastModified 2026-01-31
 */

import type { Issue, IssueType } from '../types/issues';
import type {
  NamespaceInfo,
  Attribution,
  ExecutionContext,
  ManagedPackageGuidance,
  ResourceLink,
  VendorInfo,
  AIGuidanceGenerator,
} from '../types/managed';
// Namespace detector is used via NamespaceInfo passed in

// ============================================================================
// AI Guidance Generator Implementation
// ============================================================================

/**
 * Main AI guidance generator
 */
export const aiGuidanceGenerator: AIGuidanceGenerator = {
  generateGuidance,
  generateObfuscationGuidance,
  generateVendorContactGuidance,
};

/**
 * Generate comprehensive AI guidance for a managed package issue
 */
export function generateGuidance(
  issue: Issue,
  attribution: Attribution,
  context: ExecutionContext[]
): ManagedPackageGuidance {
  const contextExplanation = generateContextExplanation(issue, attribution, context);
  const canHelpWith = determineCanHelpWith(issue, attribution);
  const cannotHelpWith = determineCannotHelpWith(issue, attribution);
  const possibleWorkarounds = generateWorkarounds(issue, attribution);
  const clarifyingQuestions = generateClarifyingQuestions(issue, attribution);
  const resources = generateResources(issue, attribution);

  return {
    issue,
    attribution,
    contextExplanation,
    canHelpWith,
    cannotHelpWith,
    possibleWorkarounds,
    clarifyingQuestions,
    resources,
  };
}

/**
 * Generate guidance for obfuscated code
 */
export function generateObfuscationGuidance(
  namespace: NamespaceInfo,
  issues: Issue[]
): string {
  const lines: string[] = [];
  
  lines.push(`## Working with Obfuscated Code: ${namespace.namespace}`);
  lines.push('');
  
  if (namespace.vendor) {
    lines.push(`**Package**: ${namespace.vendor.product} by ${namespace.vendor.name}`);
    lines.push('');
  }
  
  lines.push('### Limitations');
  lines.push('- Source code is not visible (managed package)');
  lines.push('- Cannot modify internal logic');
  lines.push('- Stack traces may show only line numbers, not method names');
  lines.push('');
  
  lines.push('### What You CAN Do');
  lines.push('1. **Review Integration Points**: Check where your code calls into the package');
  lines.push('2. **Validate Inputs**: Ensure data passed to the package is valid');
  lines.push('3. **Follow Documentation**: Use only documented APIs and patterns');
  lines.push('4. **Check Configurations**: Review package settings in Setup');
  lines.push('');
  
  lines.push('### Analyzing Issues');
  
  // Group issues by type
  const issuesByType = new Map<IssueType, Issue[]>();
  for (const issue of issues) {
    const existing = issuesByType.get(issue.type) || [];
    existing.push(issue);
    issuesByType.set(issue.type, existing);
  }
  
  for (const [type, typeIssues] of issuesByType) {
    lines.push(`\n**${type.replace(/_/g, ' ')}** (${typeIssues.length} occurrences)`);
    lines.push(getObfuscationGuidanceForIssueType(type, namespace));
  }
  
  lines.push('');
  lines.push('### When to Contact Vendor');
  lines.push('- Issue consistently reproducible with minimal test case');
  lines.push('- Issue blocks critical business functionality');
  lines.push('- Issue appears after package upgrade');
  lines.push('- No workaround is available');
  
  return lines.join('\n');
}

/**
 * Generate vendor contact guidance
 */
export function generateVendorContactGuidance(
  vendor: VendorInfo,
  issues: Issue[]
): string {
  const lines: string[] = [];
  
  lines.push(`## Contacting ${vendor.name} Support`);
  lines.push('');
  lines.push(`**Product**: ${vendor.product}`);
  
  if (vendor.supportUrl) {
    lines.push(`**Support Portal**: ${vendor.supportUrl}`);
  }
  
  if (vendor.documentationUrl) {
    lines.push(`**Documentation**: ${vendor.documentationUrl}`);
  }
  
  lines.push('');
  lines.push('### Preparing Your Support Case');
  lines.push('');
  lines.push('Include the following information:');
  lines.push('');
  lines.push('1. **Issue Summary**');
  
  const uniqueTypes = new Set(issues.map(i => i.type));
  for (const type of uniqueTypes) {
    lines.push(`   - ${type.replace(/_/g, ' ')}`);
  }
  
  lines.push('');
  lines.push('2. **Environment Details**');
  lines.push('   - Salesforce Edition');
  lines.push('   - Package Version');
  lines.push('   - Sandbox or Production');
  lines.push('');
  lines.push('3. **Reproduction Steps**');
  lines.push('   - Specific user actions');
  lines.push('   - Data conditions');
  lines.push('   - Expected vs actual behavior');
  lines.push('');
  lines.push('4. **Debug Log**');
  lines.push('   - Provide the full debug log');
  lines.push('   - Highlight the relevant error section');
  lines.push('');
  
  if (vendor.knownIssues && vendor.knownIssues.length > 0) {
    lines.push('### Known Issues for This Package');
    for (const knownIssue of vendor.knownIssues) {
      lines.push(`- ${knownIssue}`);
    }
  }
  
  return lines.join('\n');
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate context explanation
 */
function generateContextExplanation(
  issue: Issue,
  attribution: Attribution,
  context: ExecutionContext[]
): string {
  const parts: string[] = [];
  
  // Describe the issue
  parts.push(`**Issue**: ${issue.title}`);
  parts.push(`**Category**: ${issue.category}`);
  parts.push(`**Severity**: ${issue.severity}`);
  parts.push('');
  
  // Describe attribution
  switch (attribution.source) {
    case 'USER_CODE':
      parts.push('**Attribution**: This issue originates in your custom Apex code.');
      parts.push('You have full control to modify and fix this issue.');
      break;
    
    case 'MANAGED_PACKAGE':
      parts.push(`**Attribution**: This issue originates in the ${attribution.namespace || 'managed'} package.`);
      parts.push('The source code is not accessible. Focus on workarounds or vendor contact.');
      if (attribution.vendorContact) {
        parts.push(`**Vendor**: ${attribution.vendorContact.name} - ${attribution.vendorContact.product}`);
      }
      break;
    
    case 'BOUNDARY':
      parts.push('**Attribution**: This issue occurs at the integration boundary.');
      parts.push('While you cannot modify the package code, you can optimize your side of the integration.');
      break;
    
    default:
      parts.push('**Attribution**: Cannot determine definitively where this issue originates.');
      parts.push('Review both custom code and package interactions.');
  }
  
  // Add context flow if available
  if (context.length > 0) {
    const uniqueNamespaces = new Set<string>();
    for (const ctx of context) {
      if (ctx.namespace) uniqueNamespaces.add(ctx.namespace);
    }
    
    if (uniqueNamespaces.size > 0) {
      parts.push('');
      parts.push(`**Execution Context**: Code flowed through: ${Array.from(uniqueNamespaces).join(' → ')}`);
    }
  }
  
  return parts.join('\n');
}

/**
 * Determine what AI can help with
 */
function determineCanHelpWith(issue: Issue, attribution: Attribution): string[] {
  const canHelp: string[] = [];
  
  // Always can help with analysis
  canHelp.push('Analyzing the root cause of this issue');
  canHelp.push('Explaining what the error means');
  
  if (attribution.canModify) {
    canHelp.push('Writing corrected Apex code');
    canHelp.push('Suggesting best practice implementations');
    canHelp.push('Creating unit tests to verify the fix');
  }
  
  if (attribution.source === 'BOUNDARY') {
    canHelp.push('Optimizing how your code calls the package');
    canHelp.push('Implementing bulkification on your side');
    canHelp.push('Adding defensive coding around package calls');
  }
  
  // Issue-type specific help
  switch (issue.type) {
    case 'SOQL_IN_LOOP':
    case 'N_PLUS_ONE':
      if (attribution.canModify) {
        canHelp.push('Refactoring to move queries outside loops');
        canHelp.push('Implementing Map-based caching patterns');
      }
      break;
    
    case 'CPU_HOTSPOT':
    case 'CPU_TIMEOUT':
      if (attribution.canModify) {
        canHelp.push('Optimizing algorithms and data structures');
        canHelp.push('Suggesting async processing alternatives');
      }
      break;
    
    case 'RECURSIVE_TRIGGER':
      if (attribution.canModify) {
        canHelp.push('Implementing static recursion guards');
        canHelp.push('Reviewing trigger execution order');
      }
      break;
  }
  
  // Always can help with workarounds
  canHelp.push('Suggesting workarounds');
  canHelp.push('Preparing information for vendor support case');
  
  return canHelp;
}

/**
 * Determine what AI cannot help with
 */
function determineCannotHelpWith(_issue: Issue, attribution: Attribution): string[] {
  const cannotHelp: string[] = [];
  
  if (attribution.source === 'MANAGED_PACKAGE') {
    cannotHelp.push('Viewing or modifying the managed package source code');
    cannotHelp.push('Directly fixing bugs inside the managed package');
    cannotHelp.push('Changing the internal behavior of the package');
  }
  
  if (!attribution.canView) {
    cannotHelp.push('Explaining the exact code causing the issue (code is obfuscated)');
  }
  
  // General limitations
  cannotHelp.push('Contacting the vendor on your behalf');
  cannotHelp.push('Making changes to your Salesforce org directly');
  cannotHelp.push('Guaranteeing the fix will work without testing');
  
  return cannotHelp;
}

/**
 * Generate possible workarounds
 */
function generateWorkarounds(issue: Issue, attribution: Attribution): string[] {
  const workarounds: string[] = [];
  
  // Attribution-based workarounds
  if (attribution.source === 'MANAGED_PACKAGE') {
    workarounds.push('Check if the package has configuration options to change behavior');
    workarounds.push('Look for package updates that may address this issue');
    workarounds.push('Use asynchronous processing to avoid hitting limits');
  }
  
  if (attribution.source === 'BOUNDARY') {
    workarounds.push('Batch your operations before calling the package');
    workarounds.push('Use Platform Events to decouple the integration');
    workarounds.push('Implement retry logic with exponential backoff');
  }
  
  // Issue-type specific workarounds
  switch (issue.type) {
    case 'SOQL_IN_LOOP':
    case 'N_PLUS_ONE':
      if (!attribution.canModify) {
        workarounds.push('Reduce the number of records being processed per transaction');
        workarounds.push('Use batch Apex to process records in smaller chunks');
      }
      break;
    
    case 'CPU_TIMEOUT':
    case 'CPU_HOTSPOT':
      workarounds.push('Move processing to asynchronous context (@future, Queueable)');
      workarounds.push('Reduce record batch size in triggers or batch jobs');
      workarounds.push('Process records in multiple smaller transactions');
      break;
    
    case 'RECURSIVE_TRIGGER':
      if (!attribution.canModify) {
        workarounds.push('Disable the package trigger temporarily if possible');
        workarounds.push('Use Custom Metadata to control trigger execution');
      }
      break;
    
    case 'SOQL_LIMIT_NEAR':
    case 'SOQL_LIMIT_EXCEEDED':
      workarounds.push('Implement SOQL query caching');
      workarounds.push('Use Platform Cache for frequently accessed data');
      workarounds.push('Consolidate related queries into fewer calls');
      break;
  }
  
  return workarounds;
}

/**
 * Generate clarifying questions
 */
function generateClarifyingQuestions(issue: Issue, attribution: Attribution): string[] {
  const questions: string[] = [];
  
  // General questions
  questions.push('What user action or system process triggered this issue?');
  questions.push('How many records were involved in the transaction?');
  questions.push('Has this issue occurred before, or is it new?');
  
  // Attribution-based questions
  if (attribution.source === 'MANAGED_PACKAGE') {
    questions.push(`What version of the ${attribution.namespace || 'managed'} package is installed?`);
    questions.push('Has the package been recently updated?');
    questions.push('Are there any pending package updates available?');
  }
  
  // Issue-type specific questions
  switch (issue.type) {
    case 'SOQL_IN_LOOP':
    case 'N_PLUS_ONE':
      questions.push('Is this a trigger or a scheduled job?');
      questions.push('What object types are being queried?');
      break;
    
    case 'CPU_TIMEOUT':
      questions.push('How complex is the business logic being executed?');
      questions.push('Are there any nested loops or recursive calls?');
      break;
    
    case 'RECURSIVE_TRIGGER':
      questions.push('Which triggers are active on the affected object?');
      questions.push('Are there any workflow rules or process builders involved?');
      break;
  }
  
  // Environment questions
  questions.push('Is this happening in sandbox, production, or both?');
  
  return questions;
}

/**
 * Generate relevant resources
 */
function generateResources(issue: Issue, attribution: Attribution): ResourceLink[] {
  const resources: ResourceLink[] = [];
  
  // Vendor resources
  if (attribution.vendorContact?.supportUrl) {
    resources.push({
      title: `${attribution.vendorContact.name} Support Portal`,
      url: attribution.vendorContact.supportUrl,
      type: 'SUPPORT',
      relevance: 'Submit support cases and check for known issues',
    });
  }
  
  if (attribution.vendorContact?.documentationUrl) {
    resources.push({
      title: `${attribution.vendorContact.product} Documentation`,
      url: attribution.vendorContact.documentationUrl,
      type: 'DOCUMENTATION',
      relevance: 'Official documentation for the package',
    });
  }
  
  // Salesforce developer resources
  resources.push({
    title: 'Salesforce Developer Documentation',
    url: 'https://developer.salesforce.com/docs',
    type: 'DOCUMENTATION',
    relevance: 'Platform documentation and best practices',
  });
  
  // Issue-specific resources
  switch (issue.category) {
    case 'ANTI_PATTERN':
      resources.push({
        title: 'Apex Design Patterns',
        url: 'https://trailhead.salesforce.com/content/learn/modules/apex_patterns_sl',
        type: 'TRAILHEAD',
        relevance: 'Learn about bulk patterns and avoiding common anti-patterns',
      });
      break;
    
    case 'GOVERNOR_LIMITS':
      resources.push({
        title: 'Execution Governors and Limits',
        url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_gov_limits.htm',
        type: 'DOCUMENTATION',
        relevance: 'Official documentation on governor limits',
      });
      break;
    
    case 'PERFORMANCE':
      resources.push({
        title: 'Apex Performance Best Practices',
        url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_performance_overview.htm',
        type: 'DOCUMENTATION',
        relevance: 'Performance optimization techniques',
      });
      break;
  }
  
  // Trailhead modules
  resources.push({
    title: 'Apex Triggers',
    url: 'https://trailhead.salesforce.com/content/learn/modules/apex_triggers',
    type: 'TRAILHEAD',
    relevance: 'Understanding trigger best practices',
  });
  
  return resources;
}

/**
 * Get obfuscation guidance for specific issue types
 */
function getObfuscationGuidanceForIssueType(type: IssueType, _namespace: NamespaceInfo): string {
  switch (type) {
    case 'SOQL_IN_LOOP':
      return '  - The package may be executing queries in a loop internally.\n' +
        '  - Workaround: Reduce records per transaction if you control the entry point.\n' +
        '  - Consider: Report to vendor with specific record counts that cause issues.';
    
    case 'CPU_TIMEOUT':
    case 'CPU_HOTSPOT':
      return '  - CPU usage is high in package code.\n' +
        '  - Workaround: Process fewer records at a time.\n' +
        '  - Consider: Check if async processing options are available in the package.';
    
    case 'RECURSIVE_TRIGGER':
      return '  - Package triggers may be causing recursion.\n' +
        '  - Workaround: Check package settings for recursion control.\n' +
        '  - Consider: Contact vendor about trigger optimization.';
    
    case 'EXCEPTION_THROWN':
    case 'FATAL_ERROR':
      return '  - Exception occurred within package code.\n' +
        '  - Analyze: Check what data/action triggers the exception.\n' +
        '  - Workaround: Validate inputs before calling package functionality.';
    
    default:
      return '  - Issue detected in package code.\n' +
        '  - Gather: Detailed reproduction steps.\n' +
        '  - Action: Contact vendor with specifics.';
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Generate quick guidance summary
 */
export function generateQuickGuidance(issue: Issue, attribution: Attribution): string {
  const lines: string[] = [];
  
  lines.push(`**${issue.title}**`);
  lines.push(`Attribution: ${attribution.source.replace(/_/g, ' ')}`);
  
  if (attribution.source === 'MANAGED_PACKAGE') {
    lines.push(`Package: ${attribution.namespace || 'Unknown'}`);
    if (attribution.vendorContact) {
      lines.push(`Vendor: ${attribution.vendorContact.name}`);
    }
    lines.push('Action: Contact vendor or implement workaround');
  } else if (attribution.source === 'USER_CODE') {
    lines.push('Action: Apply recommended fix to your code');
  } else if (attribution.source === 'BOUNDARY') {
    lines.push('Action: Optimize your integration code');
  }
  
  return lines.join('\n');
}

/**
 * Get AI limitation statement
 */
export function getAILimitationStatement(attribution: Attribution): string {
  if (attribution.source === 'MANAGED_PACKAGE' && !attribution.canView) {
    return '⚠️ **AI Limitation**: The source code for this issue is in a managed package ' +
      'and is not visible. I can suggest workarounds but cannot provide a direct fix.';
  }
  
  if (attribution.source === 'BOUNDARY') {
    return 'ℹ️ **Note**: This issue is at an integration boundary. I can help optimize ' +
      'your code but cannot modify the managed package side.';
  }
  
  return '';
}

// ============================================================================
// Exports
// ============================================================================
