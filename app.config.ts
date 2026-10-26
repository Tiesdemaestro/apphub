import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const bundleIdentifier = process.env.APPHUB_BUNDLE_ID || 'com.tiesdemaestro.apphub';
  const appleTeamId = process.env.APPHUB_APPLE_TEAM_ID;
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    for (const name of ['APPHUB_BUNDLE_ID', 'APPHUB_APPLE_TEAM_ID', 'EXPO_PUBLIC_SUPPORT_URL', 'EXPO_PUBLIC_PRIVACY_URL']) {
      if (!process.env[name]) throw new Error(`Stel ${name} in voordat je de productiebuild start.`);
    }
    if (bundleIdentifier === 'com.example.apphub') throw new Error('Gebruik je eigen Bundle ID.');
  }
  return {
    ...config,
    name: 'AppHub', slug: config.slug || 'ties-oosterman', version: '1.1.0', platforms: ['ios'],
    orientation: 'portrait', userInterfaceStyle: 'light', icon: './assets/icon.png',
    // SDK 58 no longer accepts the legacy splash key. Use the native default launch screen.
    ios: {
      ...config.ios, supportsTablet: false, bundleIdentifier, ...(appleTeamId ? { appleTeamId } : {}), buildNumber: '1',
      // Export-compliance answer must be reviewed for the final build.
      infoPlist: { ...config.ios?.infoPlist, UIFileSharingEnabled: false, LSSupportsOpeningDocumentsInPlace: false },
      privacyManifests: { NSPrivacyTracking: false },
    },
    plugins: [
      'expo-dev-client', 'expo-sqlite', 'expo-secure-store',
      ['expo-image-picker', { photosPermission: 'Kies zelf een foto om aan je app toe te voegen.', cameraPermission: false, microphonePermission: false }],
    ],
  };
};
