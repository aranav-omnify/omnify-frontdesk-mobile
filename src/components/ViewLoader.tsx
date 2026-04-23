import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  Easing,
  interpolate,
  withSequence,
  SharedValue
} from 'react-native-reanimated';
import { Image } from 'expo-image';

interface Props {
  isDark?: boolean;
}

const LOGO_URL = "https://cdn.prod.website-files.com/6461b7c552fe54afa43154cb/69c65bca9841104c642204f5_Frame%203.svg";

const Arc = ({ size, duration, color, pulse }: { size: number, duration: number, color: string, pulse: SharedValue<number> }) => {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, [duration]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotate: `${rotation.value}deg` },
        { scale: pulse.value }
      ],
      opacity: interpolate(pulse.value, [0.95, 1.05], [0.6, 1]),
    };
  });

  return (
    <Animated.View 
      style={[
        styles.arcWrap, 
        { width: size, height: size },
        animatedStyle
      ]}
    >
      <View 
        style={[
          styles.arc, 
          { 
            width: size, 
            height: size, 
            borderColor: 'transparent',
            borderTopColor: color,
            borderRightColor: color,
            borderWidth: 3,
            borderRadius: size / 2,
          }
        ]} 
      />
    </Animated.View>
  );
};

export const ViewLoader: React.FC<Props> = ({ isDark = false }) => {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.95, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.02, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulse.value }],
    };
  });

  const arcColor = isDark ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 0, 0, 0.8)';
  const arcColor2 = isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.5)';
  const arcColor3 = isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <View style={styles.logoBox}>
        <Arc size={120} duration={3000} color={arcColor} pulse={pulse} />
        <Arc size={140} duration={3800} color={arcColor2} pulse={pulse} />
        <Arc size={160} duration={4600} color={arcColor3} pulse={pulse} />
        
        <Animated.View style={[styles.imageContainer, logoStyle]}>
          <Image 
            source={{ uri: LOGO_URL }} 
            style={styles.logo}
            contentFit="contain"
          />
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  logoBox: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arcWrap: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arc: {
    position: 'absolute',
  },
  imageContainer: {
    width: 80,
    height: 80,
    zIndex: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
});

export default ViewLoader;
