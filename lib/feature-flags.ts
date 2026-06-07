export type FeatureFlagName = 'FTC_IDENTITY_THEFT_REPORT';

type FeatureFlag = {
  name: FeatureFlagName;
  enabled: boolean;
  reason?: string;
};

const FEATURE_FLAGS: Record<FeatureFlagName, FeatureFlag> = {
  FTC_IDENTITY_THEFT_REPORT: {
    name: 'FTC_IDENTITY_THEFT_REPORT',
    enabled: true
  }
};

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return FEATURE_FLAGS[name].enabled;
}

export function getFeatureDisabledReason(name: FeatureFlagName): string | undefined {
  return FEATURE_FLAGS[name].enabled ? undefined : FEATURE_FLAGS[name].reason;
}

export function assertFeatureEnabled(name: FeatureFlagName, context?: string): void {
  if (!isFeatureEnabled(name)) {
    const reason = getFeatureDisabledReason(name) || 'Feature is disabled.';
    throw new Error(context ? `${reason} (${context})` : reason);
  }
}

export function shouldProcessFeature(name: FeatureFlagName): boolean {
  return isFeatureEnabled(name);
}

export function getFeatureFlags(): Record<FeatureFlagName, FeatureFlag> {
  return FEATURE_FLAGS;
}

export function setFeatureEnabled(name: FeatureFlagName, enabled: boolean): void {
  FEATURE_FLAGS[name].enabled = enabled;
}

export function resetFeatureFlags(): void {
  FEATURE_FLAGS.FTC_IDENTITY_THEFT_REPORT.enabled = true;
}
