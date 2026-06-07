/**
 * Feature Flag Management System
 * 
 * Provides a centralized, consistent approach to managing feature flags.
 * Replaces scattered boolean checks with a proper abstraction.
 */

export type FeatureFlagName = 'FTC_IDENTITY_THEFT_REPORT';

interface FeatureFlag {
  name: FeatureFlagName;
  enabled: boolean;
  reason?: string;
}

const FEATURE_FLAGS: Record<FeatureFlagName, FeatureFlag> = {
  FTC_IDENTITY_THEFT_REPORT: {
    name: 'FTC_IDENTITY_THEFT_REPORT',
    enabled: true,
    reason: 'FTC Identity Theft Report generation is not yet available. This feature is planned for a future release.'
  }
};

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return FEATURE_FLAGS[name].enabled;
}

/**
 * Get the reason why a feature is disabled (if any)
 */
export function getFeatureDisabledReason(name: FeatureFlagName): string | undefined {
  if (isFeatureEnabled(name)) return undefined;
  return FEATURE_FLAGS[name].reason;
}

/**
 * Assertion: throw error if feature is not enabled
 */
export function assertFeatureEnabled(name: FeatureFlagName, context?: string): void {
  if (!isFeatureEnabled(name)) {
    const reason = getFeatureDisabledReason(name);
    throw new Error(`${reason} ${context ? `(${context})` : ''}`);
  }
}

/**
 * Graceful check: return false if feature is not enabled (no error thrown)
 */
export function shouldProcessFeature(name: FeatureFlagName): boolean {
  return isFeatureEnabled(name);
}

/**
 * Get all active feature flags (for debugging/admin purposes)
 */
export function getFeatureFlags(): Record<FeatureFlagName, FeatureFlag> {
  return FEATURE_FLAGS;
}

/**
 * Update a feature flag (for testing or runtime configuration)
 */
export function setFeatureEnabled(name: FeatureFlagName, enabled: boolean): void {
  FEATURE_FLAGS[name].enabled = enabled;
}

/**
 * Reset all feature flags to defaults
 */
export function resetFeatureFlags(): void {
  FEATURE_FLAGS['FTC_IDENTITY_THEFT_REPORT'].enabled = true;
}
