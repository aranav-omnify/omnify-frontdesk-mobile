import * as SplashScreen from "expo-splash-screen";
import { setStatusBarStyle } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
    AppState,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useColorScheme,
    Alert,
    Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import ViewLoader from "../components/ViewLoader";
import { APP_CONFIG } from "../constants";

// Environment variables
const BASE_URL =
  process.env.EXPO_PUBLIC_BASE_URL || APP_CONFIG.DEFAULT_BASE_URL;

const THEME_DETECTION_SCRIPT = `
  (function() {
    function getTheme() {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }

    function sendTheme() {
      const theme = getTheme();
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          action: 'THEME_CHANGE',
          payload: { theme: theme }
        }));
      }
    }

    // Send initial theme
    if (document.readyState === 'complete') {
      sendTheme();
    } else {
      window.addEventListener('load', sendTheme);
      document.addEventListener('DOMContentLoaded', sendTheme);
    }

    // Watch for dynamic changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          sendTheme();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    // --- CONSOLE LOG FORWARDING ---
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = function() {
      const args = Array.from(arguments);
      originalLog.apply(console, args);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CONSOLE_LOG', level: 'log', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }));
      }
    };
    
    console.error = function() {
      const args = Array.from(arguments);
      originalError.apply(console, args);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CONSOLE_LOG', level: 'error', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }));
      }
    };
    
    console.warn = function() {
      const args = Array.from(arguments);
      originalWarn.apply(console, args);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CONSOLE_LOG', level: 'warn', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }));
      }
    };
  })();
  true;
`;

interface WebViewScreenProps {
  routePath?: string;
}

export default function WebViewScreen({ routePath = "" }: WebViewScreenProps) {
  const systemColorScheme = useColorScheme();
  const webViewRef = useRef<WebView>(null);
  const onLoadEndRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(
    systemColorScheme === "dark" ? "dark" : "light",
  );

  // Sync with system theme when it changes (before WebView loads or as fallback)
  useEffect(() => {
    if (systemColorScheme) {
      setTheme(systemColorScheme);
      // Force the web app to match the native system theme
      webViewRef.current?.injectJavaScript(`
        try {
          localStorage.setItem('omnify_theme_mode', '${systemColorScheme}');
          if ('${systemColorScheme}' === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          window.dispatchEvent(new Event('storage'));
        } catch (e) {
          console.error('Error syncing theme to web:', e);
        }
        true;
      `);
    }
  }, [systemColorScheme]);

  const handleNavigationStateChange = async (navState: any) => {
    // No-op for now, location request moved to onMessage
  };

  // Initial URI construction
  const getTargetUri = (path: string) => {
    const cleanPath = path.startsWith("/") ? path.substring(1) : path;
    return `${BASE_URL}${cleanPath}`;
  };

  const initialUri = getTargetUri(routePath);
  const lastNavigatedUri = useRef(initialUri);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);



  // Handle deep link updates when the app is already open
  useEffect(() => {
    const targetUri = getTargetUri(routePath);
    if (webViewRef.current && targetUri !== lastNavigatedUri.current) {
      console.log("Deep link updated, navigating to:", targetUri);
      webViewRef.current.injectJavaScript(
        `window.location.href = '${targetUri}';`,
      );
      lastNavigatedUri.current = targetUri;
    }
  }, [routePath]);

  // Update system background color and status bar style when theme changes
  useEffect(() => {
    const isDark = theme === "dark";
    const bgColor = isDark ? "#1a1a1a" : "#ffffff";
    SystemUI.setBackgroundColorAsync(bgColor);
    setStatusBarStyle(isDark ? "light" : "dark");
  }, [theme]);

  const handleLoadEnd = () => {
    onLoadEndRef.current = true;
    // Small delay for initial paint before hiding loader
    setLoading(false);
    SplashScreen.hideAsync();
  };

  const onMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "CONSOLE_LOG") {
        console.log(`[Website ${data.level.toUpperCase()}]:`, data.message);
        return;
      }

      if (data.action === "REQUEST_LOCATION_PERMISSION") {
        if (Platform.OS === 'android') {
          try {
            console.log("[Native] Requesting foreground permissions...");
            const response = await Location.requestForegroundPermissionsAsync();
            const { status, canAskAgain } = response;
            console.log("[Native] Permission status returned:", status, "canAskAgain:", canAskAgain);
            let granted = status === 'granted';
            
            // If the app has permission, also check if the phone's GPS is actually turned on!
            if (granted) {
              const servicesEnabled = await Location.hasServicesEnabledAsync();
              if (!servicesEnabled) {
                console.log("[Native] GPS is off! Prompting user to turn it on...");
                try {
                  await Location.enableNetworkProviderAsync();
                  console.log("[Native] User turned on GPS successfully.");
                } catch (e) {
                  console.log("[Native] User refused to turn on GPS.");
                  granted = false; // Deny it if they refuse to turn on GPS
                }
              }
            } else if (!canAskAgain) {
              // Permission was denied by the user permanently (OS won't show prompt anymore).
              // Prompt them to open OS settings since they can't re-trigger the default prompt.
              Alert.alert(
                "Location Permission Required",
                "Please enable location permissions for this app in your device settings to clock in.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Open Settings", onPress: () => Linking.openSettings() }
                ]
              );
            }
            
            webViewRef.current?.injectJavaScript(`
              console.log("[Website] Received NATIVE_LOCATION_RESULT: ${granted}");
              window.dispatchEvent(new CustomEvent('NATIVE_LOCATION_RESULT', { detail: { granted: ${granted} } }));
              true;
            `);
          } catch (e) {
            console.warn("[Native] Failed to request location permission", e);
            webViewRef.current?.injectJavaScript(`
              window.dispatchEvent(new CustomEvent('NATIVE_LOCATION_RESULT', { detail: { granted: false } }));
              true;
            `);
          }
        } else {
          // iOS handles the prompt natively via the WebView when it actually tries to read GPS.
          // However, we can check if they ALREADY denied it at the OS level so we can show the Settings alert!
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'denied') {
            Alert.alert(
              "Location Permission Required",
              "Please enable location permissions for this app in your device settings to clock in.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() }
              ]
            );
            webViewRef.current?.injectJavaScript(`
              window.dispatchEvent(new CustomEvent('NATIVE_LOCATION_RESULT', { detail: { granted: false } }));
              true;
            `);
            return;
          }

          webViewRef.current?.injectJavaScript(`
            window.dispatchEvent(new CustomEvent('NATIVE_LOCATION_RESULT', { detail: { granted: true } }));
            true;
          `);
        }
        return;
      }
      
      console.log("[Native] onMessage received:", event.nativeEvent.data);
      
      if (data.action === "THEME_CHANGE" && data.payload?.theme) {
        setTheme(data.payload.theme);
      }
    } catch (err) {
      console.error("Error handling WebView message:", err);
    }
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    webViewRef.current?.reload();
  };

  const isDark = theme === "dark";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? "#1a1a1a" : "#fff" }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[
          styles.container,
          { backgroundColor: isDark ? "#1a1a1a" : "#fff" },
        ]}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <WebView
          ref={webViewRef}
          source={{ uri: initialUri }}
          style={{ backgroundColor: isDark ? "#1a1a1a" : "#fff" }}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          incognito={false}
          geolocationEnabled={true}
          applicationNameForUserAgent="OmnifyMobileApp"
          // iOS: WKWebView needs these for getUserMedia to work inline instead of
          // forcing fullscreen, and to avoid re-prompting on every capture call.
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          injectedJavaScript={THEME_DETECTION_SCRIPT}
          onLoadEnd={handleLoadEnd}
          onMessage={onMessage}
          onNavigationStateChange={handleNavigationStateChange}
          // iOS: WKWebView content process can be killed by the OS under memory
          // pressure, leaving a blank screen. Reload to recover gracefully.
          onContentProcessDidTerminate={() => {
            console.warn("[Native] WebView content process terminated, reloading...");
            webViewRef.current?.reload();
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn("WebView error: ", nativeEvent);
            setError(nativeEvent.description || "Failed to load page");
            setLoading(false);
          }}
        />
      </KeyboardAvoidingView>

      {loading && !error && <ViewLoader isDark={isDark} />}

      {error && (
        <View
          style={[
            styles.overlayContainer,
            { backgroundColor: isDark ? "#1a1a1a" : "#fff" },
          ]}
        >
          <Text
            style={[
              styles.errorText,
              { color: isDark ? "#fff" : APP_CONFIG.ERROR_TEXT_COLOR },
            ]}
          >
            Oops! Something went wrong.
          </Text>
          <Text
            style={[styles.errorSubText, { color: isDark ? "#ccc" : "#666" }]}
          >
            {error}
          </Text>
          <TouchableOpacity
            style={[
              styles.retryButton,
              { backgroundColor: isDark ? "#fff" : "#000" },
            ]}
            onPress={handleRetry}
          >
            <Text
              style={[
                styles.retryButtonText,
                { color: isDark ? "#000" : "#fff" },
              ]}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlayContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 20,
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  loader: {
    marginTop: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: "600",
    color: APP_CONFIG.ERROR_TEXT_COLOR,
    marginBottom: 10,
    textAlign: "center",
  },
  errorSubText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#000",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
