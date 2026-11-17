import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.dawghwa",
  appName: "Dawghwa",
  webDir: "dist",
  backgroundColor: "#0d0c0b",
  android: {
    // Images come from https hosts only; no mixed content.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: false,
      backgroundColor: "#0d0c0b",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    Keyboard: { resize: "body", resizeOnFullScreen: true },
    StatusBar: { overlaysWebView: true, style: "DARK", backgroundColor: "#00000000" },
  },
};

export default config;
