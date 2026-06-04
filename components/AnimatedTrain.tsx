import React, { useEffect } from 'react';
import { Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, Line, Rect, G, Circle } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TRAIN_WIDTH = 760;

export default function AnimatedTrain() {
  const translateX = useSharedValue(-(TRAIN_WIDTH + 40));

  useEffect(() => {
    translateX.value = withRepeat(
      withSequence(
        withTiming(-(TRAIN_WIDTH + 40), { duration: 0 }),
        withTiming(SCREEN_WIDTH + 40, {
          duration: 10000,
          easing: Easing.linear,
        })
      ),
      -1,
      false
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[{ position: 'absolute', bottom: 72 }, animStyle]}>
      <Svg width={TRAIN_WIDTH} height={140} viewBox="0 0 800 400">

        {/* Líneas de velocidad detrás del tren */}
        <G stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity="0.5">
          <Line x1="0" y1="278" x2="120" y2="278" />
          <Line x1="0" y1="292" x2="90"  y2="292" />
          <Line x1="0" y1="308" x2="110" y2="308" />
        </G>
        <G stroke="#fff" strokeWidth="0.8" strokeLinecap="round" opacity="0.25">
          <Line x1="0" y1="270" x2="70" y2="270" />
          <Line x1="0" y1="318" x2="80" y2="318" />
        </G>

        {/* Tren */}
        <G stroke="#fff" strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" opacity="0.95">
          {/* Vagón 5 */}
          <Path d="M 130 260 L 200 260 L 200 325 L 130 325 Z" />
          <Rect x="140" y="272" width="12" height="10" rx="1" />
          <Rect x="160" y="272" width="12" height="10" rx="1" />
          <Rect x="180" y="272" width="12" height="10" rx="1" />
          <Circle cx="150" cy="328" r="4" />
          <Circle cx="180" cy="328" r="4" />
          {/* Vagón 4 */}
          <Path d="M 205 260 L 275 260 L 275 325 L 205 325 Z" />
          <Rect x="215" y="272" width="12" height="10" rx="1" />
          <Rect x="235" y="272" width="12" height="10" rx="1" />
          <Rect x="255" y="272" width="12" height="10" rx="1" />
          <Circle cx="225" cy="328" r="4" />
          <Circle cx="255" cy="328" r="4" />
          {/* Vagón 3 */}
          <Path d="M 280 260 L 350 260 L 350 325 L 280 325 Z" />
          <Rect x="290" y="272" width="12" height="10" rx="1" />
          <Rect x="310" y="272" width="12" height="10" rx="1" />
          <Rect x="330" y="272" width="12" height="10" rx="1" />
          <Circle cx="300" cy="328" r="4" />
          <Circle cx="330" cy="328" r="4" />
          {/* Vagón 2 */}
          <Path d="M 355 260 L 425 260 L 425 325 L 355 325 Z" />
          <Rect x="365" y="272" width="12" height="10" rx="1" />
          <Rect x="385" y="272" width="12" height="10" rx="1" />
          <Rect x="405" y="272" width="12" height="10" rx="1" />
          <Circle cx="375" cy="328" r="4" />
          <Circle cx="405" cy="328" r="4" />
          {/* Vagón 1 */}
          <Path d="M 430 260 L 500 260 L 500 325 L 430 325 Z" />
          <Rect x="440" y="272" width="12" height="10" rx="1" />
          <Rect x="460" y="272" width="12" height="10" rx="1" />
          <Rect x="480" y="272" width="12" height="10" rx="1" />
          <Circle cx="450" cy="328" r="4" />
          <Circle cx="480" cy="328" r="4" />
          {/* Locomotora */}
          <Path d="M 505 260 L 565 260 C 595 260, 620 275, 635 295 L 650 315 C 655 322, 648 325, 635 325 L 505 325 Z" />
          <Path d="M 590 270 L 610 270 C 618 278, 620 285, 612 292 L 600 292 Z" />
          <Rect x="520" y="272" width="12" height="10" rx="1" />
          <Rect x="540" y="272" width="12" height="10" rx="1" />
          <Circle cx="525" cy="328" r="4" />
          <Circle cx="565" cy="328" r="4" />
          {/* Líneas aerodinámicas */}
          <Line x1="130" y1="266" x2="565" y2="266" strokeWidth="0.75" opacity="0.5" />
          <Line x1="130" y1="318" x2="640" y2="318" strokeWidth="0.75" opacity="0.5" />
        </G>

      </Svg>
    </Animated.View>
  );
}
