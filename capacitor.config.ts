import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.playlistvault.desktop',
  appName: 'PlaylistVault',
  webDir: 'dist',
  // Android 10 (API 29) → latest. Scoped storage, sideload APK, no Play Store.
  plugins: {
    SplashScreen: { launchShowDuration: 800 }
  },
  android: {
    // Ensures gradle uses correct SDK — min 29 = Android 10
    // target 34 = Android 14, compile 34 (latest stable before 35)
  }
};

export default config;
