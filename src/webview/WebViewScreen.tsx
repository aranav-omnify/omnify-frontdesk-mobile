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

    function getBgColor(x, y) {
      try {
        let el = document.elementFromPoint(x, y);
        let colors = [];
        while (el && el !== document) {
          const bg = window.getComputedStyle(el).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            colors.unshift(bg); // Add to start so bottom-most is first
            const match = bg.match(/rgba\\([^,]+,\\s*[^,]+,\\s*[^,]+,\\s*([0-9.]+)\\)/);
            if (!match || parseFloat(match[1]) === 1) {
              break; // Found an opaque color, stop traversing
            }
          }
          el = el.parentNode;
        }

        const isDark = document.documentElement.classList.contains('dark');
        const defaultBg = isDark ? 'rgb(26, 26, 26)' : 'rgb(255, 255, 255)';
        
        if (colors.length === 0) return defaultBg;

        // Use canvas to composite the colors and get the exact visual opaque color
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        
        // Fill with default background first
        ctx.fillStyle = defaultBg;
        ctx.fillRect(0, 0, 1, 1);

        // Layer the found colors on top
        for (let i = 0; i < colors.length; i++) {
          ctx.fillStyle = colors[i];
          ctx.fillRect(0, 0, 1, 1);
        }
        
        const data = ctx.getImageData(0, 0, 1, 1).data;
        return 'rgb(' + data[0] + ', ' + data[1] + ', ' + data[2] + ')';
      } catch(e) {}
      return null;
    }

    let lastTopBg = null;
    let lastBottomBg = null;
    let lastTheme = null;

    function sendTheme() {
      const theme = getTheme();
      const topBg = getBgColor(window.innerWidth / 2, 10);
      const bottomBg = getBgColor(window.innerWidth / 2, window.innerHeight - 10);

      if (theme !== lastTheme || topBg !== lastTopBg || bottomBg !== lastBottomBg) {
        lastTheme = theme;
        lastTopBg = topBg;
        lastBottomBg = bottomBg;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            action: 'THEME_CHANGE',
            payload: { theme, topBg, bottomBg }
          }));
        }
      }
    }

    // Send initial theme
    if (document.readyState === 'complete') {
      setTimeout(sendTheme, 100);
    } else {
      window.addEventListener('load', () => setTimeout(sendTheme, 100));
      document.addEventListener('DOMContentLoaded', () => setTimeout(sendTheme, 100));
    }

    // Watch for dynamic changes
    const observer = new MutationObserver((mutations) => {
      clearTimeout(window.themeUpdateTimeout);
      window.themeUpdateTimeout = setTimeout(sendTheme, 50);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    setInterval(sendTheme, 500);

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
  const [topBg, setTopBg] = useState<string | null>(null);
  const [bottomBg, setBottomBg] = useState<string | null>(null);

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
    const defaultBg = isDark ? "#1a1a1a" : "#ffffff";
    const bgColor = topBg || defaultBg;
    SystemUI.setBackgroundColorAsync(bgColor);
    setStatusBarStyle(isDark ? "light" : "dark");
  }, [theme, topBg]);

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
      
      if (data.action === "THEME_CHANGE" && data.payload) {
        if (data.payload.theme) setTheme(data.payload.theme);
        if (data.payload.topBg) setTopBg(data.payload.topBg);
        if (data.payload.bottomBg) setBottomBg(data.payload.bottomBg);
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
  const defaultBg = isDark ? "#1a1a1a" : "#fff";
  const safeAreaTopBg = topBg || defaultBg;
  const safeAreaBottomBg = bottomBg || defaultBg;

  // We use separate SafeAreaViews for top and bottom to independently style the status bar
  // and the bottom navigation bar backgrounds based on the web view's active colors.

  return (
    <View style={[styles.container, { backgroundColor: safeAreaBottomBg }]}>
      {/* Top Safe Area for Status Bar */}
      <SafeAreaView edges={["top"]} style={{ backgroundColor: safeAreaTopBg, flex: 0 }} />
      
      {/* Main Content Area */}
      <SafeAreaView
        edges={["left", "right", "bottom"]}
        style={[styles.container, { backgroundColor: safeAreaBottomBg }]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[
            styles.container,
            { backgroundColor: safeAreaBottomBg },
          ]}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <WebView
          ref={webViewRef}
          source={{ uri: initialUri }}
          style={{ backgroundColor: safeAreaBottomBg }}
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
    </View>
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
