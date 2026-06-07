export type FeatureFlagName = 'FTC_IDENTITY_THEFT_REPORT';

type FeatureFlag = { name: FeatureFlagName; enabled: boolean; reason?: string };

const FEATURE_FLAGS: Record<FeatureFlagName, FeatureFlag> = {
  FTC_IDENTITY_THEFT_REPORT: { name: 'FTC_IDENTITY_THEFT_REPORT', enabled: true }
};

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return FEATURE_FLAGS[name].enabled;
}

export function getFeatureDisabledReason(name: FeatureFlagName): string | undefined {
  return isFeatureEnabled(name) ? undefined : FEATURE_FLAGS[name].reason;
}

export function assertFeatureEnabled(name: FeatureFlagName, context?: string): void {
  if (!isFeatureEnabled(name)) throw new Error(`${FEATURE