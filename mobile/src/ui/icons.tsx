import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { C } from '@/theme';

type P = { size?: number; color?: string };

const stroke = (color: string, w = 2) => ({ fill: 'none', stroke: color, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export const Back = ({ size = 22, color = C.leaf }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M15 5 8 12l7 7" {...stroke(color, 2.4)} /></Svg>
);
export const Person = ({ size = 22, color = C.leaf }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={8.5} r={4} {...stroke(color)} />
    <Path d="M4 21c1-4.2 4.2-6.5 8-6.5s7 2.3 8 6.5" {...stroke(color)} />
  </Svg>
);
export const People = ({ size = 15, color = C.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={9} cy={8} r={3.5} {...stroke(color)} />
    <Path d="M2.5 20c.8-4 3.4-6 6.5-6s5.7 2 6.5 6M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14c2 .7 3.2 2.6 3.6 6" {...stroke(color)} />
  </Svg>
);
export const Pin = ({ size = 15, color = C.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 22s7-6.4 7-12a7 7 0 0 0-14 0c0 5.6 7 12 7 12z" {...stroke(color)} />
    <Circle cx={12} cy={10} r={2.6} fill={color} />
  </Svg>
);
export const Clock = ({ size = 15, color = C.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9} {...stroke(color)} />
    <Path d="M12 7v5l3 2" {...stroke(color)} />
  </Svg>
);
export const Pot = ({ size = 28, color = C.leaf }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M3 13h18c0 4.5-3.6 8-8 8h-2c-4.4 0-8-3.5-8-8zM8 9.5c0-1.5 1-2 1-3.5M12 9.5c0-1.5 1-2 1-3.5M16 9.5c0-1.5 1-2 1-3.5" {...stroke(color)} />
  </Svg>
);
export const Door = ({ size = 26, color = C.leaf }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M3.5 21h17" {...stroke(color)} />
    <Circle cx={14.5} cy={12.5} r={1.3} fill={color} />
  </Svg>
);
export const Shield = ({ size = 26, color = C.leaf }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" {...stroke(color)} />
    <Path d="M8.5 12l2.4 2.4 4.6-4.8" {...stroke(color)} />
  </Svg>
);
export const Check = ({ size = 34, color = C.leaf, w = 2.8 }: P & { w?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" {...stroke(color, w)} /></Svg>
);
export const Phone = ({ size = 22, color = C.leaf }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" {...stroke(color)} />
  </Svg>
);
export const Upload = ({ size = 26, color = C.leaf }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" {...stroke(color)} />
  </Svg>
);
export const Camera = ({ size = 26, color = C.leaf }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" {...stroke(color)} />
    <Circle cx={12} cy={13} r={3.5} {...stroke(color)} />
  </Svg>
);
export const Bell = ({ size = 22, color = C.leaf }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0" {...stroke(color)} />
  </Svg>
);
export const Heart = ({ size = 26, color = C.leaf }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" {...stroke(color)} />
  </Svg>
);
export const Home = ({ size = 26, color = C.leaf }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" {...stroke(color)} />
  </Svg>
);
export const Paw = ({ size = 26, color = C.leaf }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={7} cy={9} r={1.8} {...stroke(color)} />
    <Circle cx={12} cy={6.5} r={1.8} {...stroke(color)} />
    <Circle cx={17} cy={9} r={1.8} {...stroke(color)} />
    <Path d="M12 12c-3 0-5.5 3.6-5.5 5.6 0 1.6 1.4 2.4 2.8 2.4 1 0 1.7-.6 2.7-.6s1.7.6 2.7.6c1.4 0 2.8-.8 2.8-2.4 0-2-2.5-5.6-5.5-5.6z" {...stroke(color)} />
  </Svg>
);

export function Star({ size = 12, filled = true }: { size?: number; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.7L10 14.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill={filled ? C.tur : '#E6DDC3'} />
    </Svg>
  );
}

/** Indian veg (green square + dot) and non-veg (brown square + triangle) marks. */
export function FoodMark({ type, size = 16 }: { type: 'veg' | 'nonveg'; size?: number }) {
  const col = type === 'veg' ? C.veg : C.nonveg;
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" accessibilityLabel={type === 'veg' ? 'Veg' : 'Non-veg'}>
      <Rect x={1} y={1} width={14} height={14} rx={2} fill="none" stroke={col} strokeWidth={1.8} />
      {type === 'veg' ? <Circle cx={8} cy={8} r={3.6} fill={col} /> : <Path d="M8 3.8 12 11H4z" fill={col} />}
    </Svg>
  );
}

/** The Anndaan mark: a banana leaf carrying a meal, from the brand design. */
export function LogoMark({ size = 34, tile = false }: { size?: number; tile?: boolean }) {
  const lines = [-92, -76, -60, -44, -28, -12, 4, 20, 36, 52, 68];
  const inner = (
    <G transform="translate(120 122) rotate(-28) scale(.86)">
      <Path d="M-146 2 L-108 2" stroke={C.leaf} strokeWidth={10} strokeLinecap="round" />
      <Path
        d="M-112 0 C-112 -40 -90 -60 -60 -62 L-22 -63 L-10 -36 L-6 -63 L72 -64 C106 -64 122 -38 122 0 C122 36 104 62 72 62 L50 62 L40 36 L35 62 L-60 62 C-92 60 -112 38 -112 0 Z"
        fill={C.leaf}
      />
      <G stroke={C.rice} strokeWidth={2.8} strokeLinecap="round" opacity={0.28} fill="none">
        {lines.map((x) => (
          <Path key={x} d={`M${x} 2 L${x + 14} -54 M${x} 2 L${x + 14} 54`} />
        ))}
      </G>
      <Path d="M-108 2 L112 2" stroke={C.rice} strokeWidth={7} strokeLinecap="round" opacity={0.5} />
      <Circle cx={-30} cy={0} r={40} fill={C.rice} />
      <Circle cx={50} cy={0} r={29} fill={C.rice} />
      <Circle cx={50} cy={0} r={18} fill={C.chilli} />
    </G>
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      {tile ? (
        <>
          <Rect width={240} height={240} rx={56} fill={C.tur} />
          <G transform="translate(34 34) scale(.7167)">{inner}</G>
        </>
      ) : (
        inner
      )}
    </Svg>
  );
}
