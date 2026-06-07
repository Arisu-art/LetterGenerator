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
    name: '