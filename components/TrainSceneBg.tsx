import React, { useEffect } from 'react';
import { Dimensions, View } from 'react-native';
import Svg, { G, Path, Line, Polygon, Rect, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

const { width: W } = Dimensions.get('window');
const VIEWBOX_W = 800;
const VIEWBOX_H = 400;
const TRAIN_SVG_W = 680; // ancho del tren en coordenadas del viewBox

export default function TrainSceneBg() {
  const translateX = useSharedValue(-(TRAIN_SVG_W + 20));

  useEffect(() => {
    translateX.value = withRepeat(
      withSequence(
        withTiming(-(TRAIN_SVG_W + 20), { duration: 0 }),
        withTiming(VIEWBOX_W + 20, {
          duration: 6000,
          easing: Easing.linear,
        })
      ),
      -1,
      false
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (translateX.value / VIEWBOX_W) * W }],
  }));

  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 420 }}>

      {/* Paisaje estático */}
      <Svg width={W} height={420} viewBox="0 0 800 400" style={{ position: 'absolute', bottom: 0 }}>

        {/* Colinas */}
        <G stroke="#fff" strokeWidth="1" fill="none" opacity="0.35" strokeLinejoin="round" strokeLinecap="round">
          <Path d="M 0 160 Q 150 110, 320 150 T 680 130 Q 740 140, 800 170" />
          <Path d="M 0 185 Q 220 140, 450 180 T 800 160" />
          <Path d="M 100 145 C 120 170, 110 180, 100 190" />
          <Path d="M 250 138 C 270 160, 260 180, 250 195" />
          <Path d="M 400 160 C 410 175, 420 185, 410 200" />
          <Path d="M 580 142 C 590 160, 570 180, 560 210" />
          <Path d="M 700 150 C 710 170, 720 190, 730 215" />
          {/* Río */}
          <Path d="M 0 210 Q 200 195, 380 220 T 800 205" />
          <Path d="M 0 235 Q 250 220, 480 245 T 800 230" />
          <Line x1="50"  y1="218" x2="180" y2="218" />
          <Line x1="280" y1="228" x2="420" y2="228" />
          <Line x1="550" y1="215" x2="710" y2="215" />
          <Line x1="120" y1="225" x2="250" y2="225" />
          <Line x1="490" y1="238" x2="630" y2="238" />
          {/* Árboles */}
          <Polygon points="40,210 50,185 60,210" />
          <Line x1="50" y1="185" x2="50" y2="212" />
          <Polygon points="55,215 62,195 70,215" />
          <Line x1="62" y1="195" x2="62" y2="217" />
          <Polygon points="510,225 522,190 534,225" />
          <Line x1="522" y1="190" x2="522" y2="227" />
          <Polygon points="530,228 540,200 550,228" />
          <Line x1="540" y1="200" x2="540" y2="230" />
          <Polygon points="670,220 680,192 690,220" />
          <Line x1="680" y1="192" x2="680" y2="222" />
        </G>

        {/* Vías */}
        <G stroke="#fff" fill="none" opacity="0.8">
          <Line x1="0" y1="320" x2="800" y2="320" strokeWidth="2" />
          <Line x1="0" y1="326" x2="800" y2="326" strokeWidth="1" />
          <Path d="M 10 326 L 5 334 M 40 326 L 35 334 M 70 326 L 65 334 M 100 326 L 95 334 M 130 326 L 125 334 M 160 326 L 155 334 M 190 326 L 185 334 M 220 326 L 215 334 M 250 326 L 245 334 M 280 326 L 275 334 M 310 326 L 305 334 M 340 326 L 335 334 M 370 326 L 365 334 M 400 326 L 395 334 M 430 326 L 425 334 M 460 326 L 455 334 M 490 326 L 485 334 M 520 326 L 515 334 M 550 326 L 545 334 M 580 326 L 575 334 M 610 326 L 605 334 M 640 326 L 635 334 M 670 326 L 665 334 M 700 326 L 695 334 M 730 326 L 725 334 M 760 326 L 755 334 M 790 326 L 785 334" strokeWidth="1" opacity="0.5" />
        </G>

      </Svg>

      {/* Tren animado — mismo sistema de coordenadas que el SVG */}
      <Animated.View style={[{ position: 'absolute', bottom: 0, left: 0 }, animStyle]}>
        <Svg width={(TRAIN_SVG_W / VIEWBOX_W) * W + 40} height={420} viewBox={`0 0 ${TRAIN_SVG_W + 40} 400`}>

          {/* Líneas de velocidad */}
          <G stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.55">
            <Line x1="0" y1="268" x2="90" y2="268" />
            <Line x1="0" y1="282" x2="70" y2="282" />
            <Line x1="0" y1="298" x2="85" y2="298" />
          </G>
          <G stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity="0.25">
            <Line x1="0" y1="260" x2="55" y2="260" />
            <Line x1="0" y1="310" x2="60" y2="310" />
          </G>

          {/* Tren — ruedas en y=320 (sobre la vía) */}
          <G stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" opacity="0.95">
            {/* Vagón 5 */}
            <Path d="M 100 245 L 195 245 L 195 315 L 100 315 Z" />
            <Rect x="112" y="257" width="14" height="11" rx="2" />
            <Rect x="134" y="257" width="14" height="11" rx="2" />
            <Rect x="156" y="257" width="14" height="11" rx="2" />
            <Circle cx="120" cy="320" r="5" />
            <Circle cx="175" cy="320" r="5" />
            {/* Vagón 4 */}
            <Path d="M 200 245 L 295 245 L 295 315 L 200 315 Z" />
            <Rect x="212" y="257" width="14" height="11" rx="2" />
            <Rect x="234" y="257" width="14" height="11" rx="2" />
            <Rect x="256" y="257" width="14" height="11" rx="2" />
            <Circle cx="220" cy="320" r="5" />
            <Circle cx="275" cy="320" r="5" />
            {/* Vagón 3 */}
            <Path d="M 300 245 L 395 245 L 395 315 L 300 315 Z" />
            <Rect x="312" y="257" width="14" height="11" rx="2" />
            <Rect x="334" y="257" width="14" height="11" rx="2" />
            <Rect x="356" y="257" width="14" height="11" rx="2" />
            <Circle cx="320" cy="320" r="5" />
            <Circle cx="375" cy="320" r="5" />
            {/* Vagón 2 */}
            <Path d="M 400 245 L 495 245 L 495 315 L 400 315 Z" />
            <Rect x="412" y="257" width="14" height="11" rx="2" />
            <Rect x="434" y="257" width="14" height="11" rx="2" />
            <Rect x="456" y="257" width="14" height="11" rx="2" />
            <Circle cx="420" cy="320" r="5" />
            <Circle cx="475" cy="320" r="5" />
            {/* Locomotora tren bala */}
            <Path d="M 500 245 L 560 245 L 560 245 C 580 245, 600 248, 618 258 C 636 268, 648 282, 655 298 L 660 310 C 663 317, 658 320, 648 320 L 500 320 Z" />
            {/* Ventana cabina inclinada */}
            <Path d="M 568 248 L 598 252 C 612 258, 622 268, 624 280 L 610 280 C 606 272, 596 264, 580 258 Z" />
            <Rect x="512" y="257" width="14" height="11" rx="2" />
            <Rect x="534" y="257" width="14" height="11" rx="2" />
            <Circle cx="520" cy="320" r="5" />
            <Circle cx="570" cy="320" r="5" />
            {/* Líneas aerodinámicas */}
            <Line x1="100" y1="252" x2="565" y2="252" strokeWidth="1" opacity="0.4" />
            <Line x1="100" y1="308" x2="640" y2="308" strokeWidth="1" opacity="0.4" />
          </G>

        </Svg>
      </Animated.View>

    </View>
  );
}
