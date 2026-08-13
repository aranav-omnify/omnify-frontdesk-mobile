import { ExpoConfig, ConfigContext } from 'expo/config';

const IS_PREPROD = process.env.APP_ENV === 'preprod';
const IS_STAGING = process.env.APP_ENV === 'staging';

let name = 'Omnify Frontdesk';
let bundleIdentifier = 'com.developersomnify.frontdesk';
let icon = './assets/images/adaptive-foreground.png';
let splashLight = './assets/images/splash-icon-light.png';
let splashDark = './assets/images/splash-icon-dark.png';

let version = '1.0.0';
let buildNumber = '1';
let versionCode = 1;


if (IS_PREPROD) {
  name = 'Omnify Frontdesk Preprod';
  bundleIdentifier = 'com.developersomnify.frontdesk.preprod';
  icon = './assets/images/Preprod.png';
  splashLight = './assets/images/Preprod.png';
  splashDark = './assets/images/Preprod.png';
  
  version = '1.0.0'; // You can change this independently for preprod
  buildNumber = '1';
  versionCode = 1;
} else if (IS_STAGING) {
  name = 'Omnify Frontdesk Staging';
  bundleIdentifier = 'com.developersomnify.frontdesk.staging';
  icon = './assets/images/Staging.png';
  splashLight = './assets/images/Staging.png';
  splashDark = './assets/images/Staging.png';

  version = '1.0.0'; // You can change this independently for staging
  buildNumber = '1';
  versionCode = 1;
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
    buildNumber,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false
    }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#262626",
      foregroundImage: icon
    },
    edgeToEdgeEnabled: true,
    softwareKeyboardLayoutMode: "resize",
    predictiveBackGestureEnabled: false,
    package: bundleIdentifier,
    versionCode
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
