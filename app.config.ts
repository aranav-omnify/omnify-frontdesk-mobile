import { ExpoConfig, ConfigContext } from 'expo/config';

const IS_PREPROD = process.env.APP_ENV === 'preprod';
const IS_STAGING = process.env.APP_ENV === 'staging';

let name = 'Omnify Frontdesk';
let bundleIdentifier = 'com.developersomnify.frontdesk';
let icon = './assets/images/adaptive-foreground.png';
let splashLight = './assets/images/splash-icon-light.png';
let splashDark = './assets/images/splash-icon-dark.png';

let version = '1.0.0';


if (IS_PREPROD) {
  name = 'Omnify Frontdesk Preprod';
  bundleIdentifier = 'com.developersomnify.frontdesk.preprod';
  icon = './assets/images/Preprod.png';
  splashLight = './assets/images/Preprod.png';
  splashDark = './assets/images/Preprod.png';
  
  version = '1.0.0'; // You can change this independently for preprod
} else if (IS_STAGING) {
  name = 'Omnify Frontdesk Staging';
  bundleIdentifier = 'com.developersomnify.frontdesk.staging';
  icon = './assets/images/Staging.png';
  splashLight = './assets/images/Staging.png';
  splashDark = './assets/images/Staging.png';

  version = '1.0.0'; // You can change this independently for staging
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name,
  slug: "omnify-frontdesk",
  version,
  orientation: "portrait",
  icon,
  scheme: "omnifyfrontdesk",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: "Omnify Frontdesk needs access to your camera to upload profile pictures.",
      NSPhotoLibraryUsageDescription: "Omnify Frontdesk needs access to your photo library to upload profile pictures.",
      NSMicrophoneUsageDescription: "Omnify Frontdesk needs access to your microphone to record videos for profile pictures."
    }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#262626",
      foregroundImage: icon
    },
    permissions: [
      "android.permission.CAMERA",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.RECORD_AUDIO"
    ],
    edgeToEdgeEnabled: true,
    softwareKeyboardLayoutMode: "resize",
    predictiveBackGestureEnabled: false,
    package: bundleIdentifier
  },
  web: {
    output: "static",
    favicon: icon
  },
  plugins: [
    "expo-router",
    [
      "expo-location",
      {
        // When-in-use only. Requesting Always triggers background-location review on both stores.
        locationWhenInUsePermission: "Omnify Frontdesk uses your location to verify check-ins at your studio.",
        locationAlwaysPermission: false,
        locationAlwaysAndWhenInUsePermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false
      }
    ],
    [
      "expo-splash-screen",
      {
        image: splashLight,
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          image: splashDark,
          backgroundColor: "#000000"
        }
      }
    ]
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true
  },
  extra: {
    router: {},
    eas: {
      projectId: "3b7acb66-b69e-43aa-8f2d-de6734051ef8"
    }
  },
  owner: "developers-omnify"
});
