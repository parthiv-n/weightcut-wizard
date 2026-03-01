import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.weightcutwizard.app',
  appName: 'Weightcut Wizard',
  webDir: 'dist',
  ios: {
    preferredContentMode: 'mobile',
    allowsLinkPreview: false,
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
};

export default config;
