import { useLocalSearchParams } from 'expo-router';
import WebViewScreen from '../src/webview/WebViewScreen';

export default function DeepLinkScreen() {
  const { route } = useLocalSearchParams<{ route?: string | string[] }>();
  const routePath = Array.isArray(route) ? route.join('/') : (route || "");
  
  return <WebViewScreen routePath={routePath} />;
}
