import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "pro.stockify.daytrader",
  appName: "Stockify Pro",
  webDir: "dist",
  backgroundColor: "#05070d",
  android: {
    allowMixedContent: false,
    backgroundColor: "#05070d",
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#05070d",
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 700,
      launchAutoHide: true,
      backgroundColor: "#05070d",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
