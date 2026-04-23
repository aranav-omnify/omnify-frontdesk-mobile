import * as SplashScreen from "expo-splash-screen";
import { setStatusBarStyle } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useRef, useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import ViewLoader from "../components/ViewLoader";
import { APP_CONFIG } from "../constants";

// Environment variables
const BASE_URL =
  process.env.EXPO_PUBLIC_BASE_URL || APP_CONFIG.DEFAULT_BASE_URL;

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
    }
  }, [systemColorScheme]);

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
    const bgColor = isDark ? "#000000" : "#ffffff";
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
    console.log("[Native] onMessage received:", event.nativeEvent.data);
    try {
      const data = JSON.parse(event.nativeEvent.data);
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
      style={[styles.container, { backgroundColor: isDark ? "#000" : "#fff" }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[
          styles.container,
          { backgroundColor: isDark ? "#000" : "#fff" },
        ]}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <WebView
          ref={webViewRef}
          source={{ uri: initialUri }}
          style={{ backgroundColor: isDark ? "#000" : "#fff" }}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          geolocationEnabled={true}
          onLoadEnd={handleLoadEnd}
          onMessage={onMessage}
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
            { backgroundColor: isDark ? "#000" : "#fff" },
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
