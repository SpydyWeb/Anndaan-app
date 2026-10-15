import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorPair, joinPair, type Pair } from '@/i18n';
import { usePrefs } from '@/store/prefs';
import { C, F, R } from '@/theme';

import { Back, FoodMark, Star } from './icons';

// ---------- text ----------

export function T({ style, ...p }: TextProps) {
  return <Text {...p} style={[s.t, style]} />;
}

/**
 * Bilingual text. In the default "both" mode Hindi sits under English at 80% size,
 * exactly as in the design; users can switch to English-only or Hindi-only.
 */
export function Bi({
  en,
  hi,
  style,
  hiStyle,
  row = false,
  numberOfLines,
}: {
  en: string;
  hi: string;
  style?: StyleProp<TextStyle>;
  hiStyle?: StyleProp<TextStyle>;
  row?: boolean;
  numberOfLines?: number;
}) {
  const mode = usePrefs((st) => st.lang);
  if (mode === 'en' || en === hi) return <T style={style} numberOfLines={numberOfLines}>{en}</T>;
  if (mode === 'hi') return <T style={style} numberOfLines={numberOfLines}>{hi}</T>;
  const flat = StyleSheet.flatten(style) ?? {};
  const size = (flat.fontSize ?? 15) * 0.8;
  const hiS: TextStyle = {
    fontSize: size,
    lineHeight: Math.round(size * 1.45),
    opacity: 0.78,
    fontFamily: flat.fontFamily === F.display || flat.fontFamily === F.displaySemi ? F.medium : flat.fontFamily ?? F.body,
  };
  if (row) {
    return (
      <T style={style} numberOfLines={numberOfLines}>
        {en} <T style={[style, hiS, hiStyle]}>{hi}</T>
      </T>
    );
  }
  return (
    <View>
      <T style={style} numberOfLines={numberOfLines}>{en}</T>
      <T style={[style, hiS, hiStyle]} numberOfLines={numberOfLines}>{hi}</T>
    </View>
  );
}

export const BiP = ({ p, ...rest }: { p: Pair } & Omit<Parameters<typeof Bi>[0], 'en' | 'hi'>) => <Bi en={p[0]} hi={p[1]} {...rest} />;

// ---------- screen scaffolding ----------

export function Screen({
  title,
  back = true,
  onBack,
  right,
  children,
  foot,
  scroll = true,
  bg = C.rice,
  refreshing,
  onRefresh,
  center = false,
  bodyStyle,
}: {
  title?: Pair;
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  scroll?: boolean;
  bg?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  center?: boolean;
  bodyStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/home')));
  const body = [s.body, center && s.center, bodyStyle];
  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top }}>
      <StatusBar style="dark" />
      {(title || back) && (
        <View style={s.hd}>
          {back && (
            <Pressable onPress={goBack} style={s.back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
              <Back />
            </Pressable>
          )}
          <View style={{ flex: 1 }}>{title && <Bi en={title[0]} hi={title[1]} style={s.h1} hiStyle={s.h1hi} />}</View>
          {right}
        </View>
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[body, { flexGrow: 1 }]}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.leaf} /> : undefined}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[body, { flex: 1 }]}>{children}</View>
        )}
        {foot && <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>{foot}</View>}
      </KeyboardAvoidingView>
    </View>
  );
}

// ---------- buttons ----------

export function Btn({
  p,
  onPress,
  kind = 'pri',
  big,
  disabled,
  loading,
  style,
  icon,
}: {
  p: Pair;
  onPress?: () => void;
  kind?: 'pri' | 'sec' | 'danger';
  big?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
}) {
  const off = disabled || loading;
  const color = kind === 'pri' ? C.tur : kind === 'danger' ? C.danger : C.leaf;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityLabel={joinPair(p, undefined, ', ')}
      style={({ pressed }) => [
        s.btn,
        kind === 'pri' ? s.btnPri : kind === 'danger' ? s.btnDanger : s.btnSec,
        big && s.btnBig,
        off && { opacity: 0.5 },
        pressed && !off && s.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <Bi en={p[0]} hi={p[1]} style={[s.btnText, { color }]} hiStyle={kind === 'pri' ? { color: C.paleYellow, opacity: 1 } : undefined} />
        </View>
      )}
    </Pressable>
  );
}

export function LinkBtn({ p, onPress, style, color = C.leaf }: { p: Pair; onPress: () => void; style?: StyleProp<ViewStyle>; color?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed }) => [{ paddingVertical: 6 }, pressed && { opacity: 0.6 }, style]}>
      <Bi en={p[0]} hi={p[1]} style={[s.link, { color }]} hiStyle={{ textDecorationLine: 'none' }} />
    </Pressable>
  );
}

export function IconBtn({ onPress, label, children, badge }: { onPress: () => void; label: string; children: ReactNode; badge?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.ic, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      {children}
      {badge && <View style={s.dot} />}
    </Pressable>
  );
}

// ---------- form controls ----------

export function Lbl({ p, style }: { p: Pair; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: 4 }, style]}>
      <Bi en={p[0]} hi={p[1]} style={s.lbl} hiStyle={{ color: C.mut, opacity: 1, fontFamily: F.medium }} />
    </View>
  );
}

export function Chip({
  p,
  on,
  onPress,
  icon,
  sub,
  style,
  tight,
  big,
  disabled,
}: {
  p: Pair;
  on?: boolean;
  onPress?: () => void;
  icon?: ReactNode;
  sub?: string;
  style?: StyleProp<ViewStyle>;
  tight?: boolean;
  big?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on, disabled: !!disabled }}
      style={({ pressed }) => [
        s.chip,
        tight && s.chipTight,
        big && s.chipBig,
        on && s.chipOn,
        disabled && { opacity: 0.4 },
        pressed && !disabled && s.pressed,
        style,
      ]}
    >
      {icon}
      <View style={{ flexShrink: 1 }}>
        <Bi en={p[0]} hi={p[1]} style={[s.chipText, big && { fontSize: 15 }, on && { color: C.leaf }]} hiStyle={{ fontSize: 11, lineHeight: 15 }} />
        {sub ? <T style={s.chipSub}>{sub}</T> : null}
      </View>
    </Pressable>
  );
}

export function Chips({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.chips, style]}>{children}</View>;
}

export function Opt({
  p,
  sub,
  icon,
  on,
  onPress,
}: {
  p: Pair;
  sub?: Pair;
  icon?: ReactNode;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      style={({ pressed }) => [s.opt, on && s.optOn, pressed && s.pressed]}
    >
      {icon ? <View style={s.oic}>{icon}</View> : null}
      <View style={{ flex: 1 }}>
        <Bi en={p[0]} hi={p[1]} style={s.optTitle} />
        {sub && <Bi en={sub[0]} hi={sub[1]} style={s.optSub} hiStyle={{ fontSize: 11 }} />}
      </View>
      <View style={[s.radio, on && s.radioOn]} />
    </Pressable>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 500,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit: Pair;
}) {
  const btn = (delta: number, label: string, glyph: string) => {
    const off = delta < 0 ? value <= min : value >= max;
    return (
      <Pressable
        onPress={() => !off && onChange(Math.max(min, Math.min(max, value + delta)))}
        onLongPress={() => !off && onChange(Math.max(min, Math.min(max, value + delta * 5)))}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [s.stepBtn, off && { opacity: 0.35 }, pressed && !off && s.pressed]}
      >
        <T style={s.stepGlyph}>{glyph}</T>
      </Pressable>
    );
  };
  return (
    <View style={s.stepper} accessibilityRole="adjustable" accessibilityValue={{ min, max, now: value }}>
      {btn(-1, 'Fewer', '−')}
      <T style={s.stepOut}>{value}</T>
      {btn(1, 'More', '+')}
      <Bi en={unit[0]} hi={unit[1]} style={{ color: C.mut, fontFamily: F.semi }} />
    </View>
  );
}

export function Field({ style, multiline, ...p }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="#9AA39B"
      multiline={multiline}
      {...p}
      style={[s.field, multiline && { minHeight: 76, textAlignVertical: 'top' }, style]}
    />
  );
}

export function FieldError({ p }: { p?: Pair | null }) {
  if (!p) return null;
  return <Bi en={p[0]} hi={p[1]} style={s.err} />;
}

/** Single hidden input drawn as separate boxes, like the design's OTP / pick-up code. */
export function CodeInput({ length, value, onChange, autoFocus }: { length: number; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const ref = useRef<TextInput>(null);
  const box = length > 4 ? 46 : 58;
  return (
    <Pressable onPress={() => ref.current?.focus()} style={{ flexDirection: 'row', gap: length > 4 ? 8 : 10 }} accessibilityLabel="Code">
      {Array.from({ length }).map((_, i) => (
        <View key={i} style={[s.otp, { width: box }, i === value.length && s.otpActive]}>
          <T style={s.otpText}>{value[i] ?? ''}</T>
        </View>
      ))}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        style={s.hiddenInput}
        caretHidden
      />
    </Pressable>
  );
}

// ---------- content blocks ----------

export function Note({ p, style }: { p: Pair; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.note, style]}>
      <Bi en={p[0]} hi={p[1]} style={s.noteText} hiStyle={{ fontFamily: F.medium }} />
    </View>
  );
}

export function Strip({ p, onPress }: { p: Pair; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.strip, pressed && s.pressed]}>
      <Bi en={p[0]} hi={p[1]} style={s.stripText} />
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && s.pressed, style]}>
        {children}
      </Pressable>
    );
  return <View style={[s.card, style]}>{children}</View>;
}

export function Tag({ p, kind }: { p: Pair; kind: 'ok' | 'res' | 'fq' }) {
  const st = kind === 'ok' ? s.tagOk : kind === 'res' ? s.tagRes : s.tagFq;
  const color = kind === 'ok' ? C.leaf : kind === 'res' ? C.white : C.amberText;
  return (
    <View style={[s.tag, st]}>
      <Bi en={p[0]} hi={p[1]} row style={[s.tagText, { color }]} hiStyle={{ fontSize: 11 }} />
    </View>
  );
}

export function Stars({ value, size = 12 }: { value: number | null; size?: number }) {
  const v = Math.round(value ?? 0);
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${value ?? 0} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} filled={i <= v} />
      ))}
    </View>
  );
}

export function Avatar({ text, big }: { text: string; big?: boolean }) {
  return (
    <View style={[s.av, big && s.avBig]}>
      <T style={[s.avText, big && { fontSize: 24 }]}>{text}</T>
    </View>
  );
}

export function Bar({ have, add = 0, total, big }: { have: number; add?: number; total: number; big?: boolean }) {
  const pct = (n: number) => `${Math.min(100, (100 * n) / Math.max(total, 1))}%` as const;
  return (
    <View
      style={[s.bar, big && s.barLg]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: have + add }}
    >
      <View style={[s.barFill, { width: pct(have) }, add > 0 && { borderTopRightRadius: 0, borderBottomRightRadius: 0 }]} />
      {add > 0 && <View style={[s.barAdd, { left: pct(have), width: pct(add) }]} />}
    </View>
  );
}

export function Timeline({ steps }: { steps: { p: Pair; state: 'done' | 'act' | 'todo' }[] }) {
  return (
    <View style={{ gap: 10, marginTop: 4, paddingLeft: 4 }}>
      {steps.map((st, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={[s.tlDot, st.state === 'done' && s.tlDone, st.state === 'act' && s.tlAct]} />
          <View style={{ flex: 1 }}>
            <Bi
              en={st.p[0]}
              hi={st.p[1]}
              style={[
                { fontSize: 14, color: C.mut },
                st.state === 'done' && { color: C.leaf, fontFamily: F.semi },
                st.state === 'act' && { color: C.ink, fontFamily: F.bold },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Facts({ items }: { items: { p: Pair; value: string }[] }) {
  return (
    <View style={s.facts}>
      {items.map((f, i) => (
        <View key={i} style={s.fact}>
          <Bi en={f.p[0]} hi={f.p[1]} style={{ color: C.mut, fontSize: 12 }} hiStyle={{ fontSize: 10.5 }} />
          <T style={s.factVal}>{f.value}</T>
        </View>
      ))}
    </View>
  );
}

export function InfoRow({
  icon,
  title,
  sub,
  right,
  onPress,
  tint,
}: {
  icon: ReactNode;
  title: Pair;
  sub?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  tint?: boolean;
}) {
  const inner = (
    <>
      {icon}
      <View style={{ flex: 1 }}>
        <Bi en={title[0]} hi={title[1]} style={s.rowTitle} />
        {sub ? <T style={s.rowSub}>{sub}</T> : null}
      </View>
      {right}
    </>
  );
  const style = [s.rowCard, tint && { backgroundColor: C.leafTint, borderWidth: 0 }];
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [...style, pressed && s.pressed]}>
        {inner}
      </Pressable>
    );
  return <View style={style}>{inner}</View>;
}

export function FoodTitle({ type, servings, size = 18 }: { type: 'veg' | 'nonveg'; servings?: number; size?: number }) {
  const en = type === 'veg' ? 'Veg meal' : 'Non-veg meal';
  const hi = type === 'veg' ? 'शाकाहारी भोजन' : 'मांसाहारी भोजन';
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', flex: 1 }}>
      <View style={{ marginTop: size > 20 ? 7 : 4 }}>
        <FoodMark type={type} size={size > 20 ? 20 : 16} />
      </View>
      <View style={{ flex: 1 }}>
        <Bi
          en={servings ? `${en} · ${servings} people` : en}
          hi={servings ? `${hi} · ${servings} लोग` : hi}
          style={{ fontFamily: F.display, fontSize: size, lineHeight: Math.round(size * 1.25), color: C.leaf }}
          hiStyle={{ fontFamily: F.medium }}
        />
      </View>
    </View>
  );
}

// ---------- states ----------

export function Loading({ label }: { label?: Pair }) {
  return (
    <View style={s.state}>
      <ActivityIndicator color={C.leaf} size="large" />
      {label && <Bi en={label[0]} hi={label[1]} style={{ color: C.mut, textAlign: 'center' }} />}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const p = errorPair(error);
  return (
    <View style={s.state}>
      <Bi en={p[0]} hi={p[1]} style={{ color: C.ink, textAlign: 'center', fontFamily: F.semi }} />
      {onRetry && <Btn p={['Try again', 'फिर कोशिश करें']} kind="sec" onPress={onRetry} style={{ alignSelf: 'stretch' }} />}
    </View>
  );
}

export function Empty({ title, body, action }: { title: Pair; body?: Pair; action?: ReactNode }) {
  return (
    <View style={s.state}>
      <Bi en={title[0]} hi={title[1]} style={{ fontFamily: F.display, fontSize: 21, color: C.leaf, textAlign: 'center' }} hiStyle={{ fontFamily: F.medium }} />
      {body && <Bi en={body[0]} hi={body[1]} style={{ color: C.mut, textAlign: 'center' }} />}
      {action}
    </View>
  );
}

export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  return <FieldError p={errorPair(error)} />;
}

// ---------- bottom sheet ----------

export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} style={s.scrim}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View entering={SlideInDown.duration(240)} style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
        <View style={s.grab} />
        {children}
      </Animated.View>
    </Modal>
  );
}

/** Simple list picker in a sheet (dates, times). */
export function PickerSheet<V extends string>({
  visible,
  onClose,
  title,
  options,
  value,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  title: Pair;
  options: { value: V; p: Pair }[];
  value: V;
  onPick: (v: V) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Bi en={title[0]} hi={title[1]} style={s.sheetH} hiStyle={{ fontFamily: F.medium }} />
      <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
        {options.map((o) => (
          <Chip key={o.value} p={o.p} on={o.value === value} onPress={() => (onPick(o.value), onClose())} />
        ))}
      </ScrollView>
    </Sheet>
  );
}

/** Ticks once a second; for countdowns. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export const s = StyleSheet.create({
  t: { fontFamily: F.body, fontSize: 15, lineHeight: 21, color: C.ink },
  hd: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: F.display, fontSize: 21, lineHeight: 26, color: C.leaf },
  h1hi: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.mut, opacity: 1 },
  body: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16, gap: 12 },
  center: { alignItems: 'center', justifyContent: 'center' },
  foot: { paddingHorizontal: 20, paddingTop: 12, gap: 8, backgroundColor: C.rice, borderTopWidth: 1, borderTopColor: C.line },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  btn: { minHeight: 54, borderRadius: R.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 6 },
  btnPri: { backgroundColor: C.leaf },
  btnSec: { borderWidth: 2, borderColor: C.leaf, minHeight: 48 },
  btnDanger: { borderWidth: 2, borderColor: C.danger, minHeight: 48 },
  btnBig: { minHeight: 58, alignSelf: 'stretch' },
  btnText: { fontFamily: F.bold, fontSize: 16, lineHeight: 21, textAlign: 'center' },
  link: { fontFamily: F.bold, fontSize: 14.5, color: C.leaf, textDecorationLine: 'underline' },
  ic: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 6, right: 7, width: 9, height: 9, borderRadius: 5, backgroundColor: C.chilli, borderWidth: 1.5, borderColor: C.white },
  lbl: { fontFamily: F.bold, fontSize: 15, color: C.leaf },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44, paddingHorizontal: 14, paddingVertical: 5, borderRadius: R.sm, backgroundColor: C.white,
    borderWidth: 1.5, borderColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  chipTight: { minHeight: 38, paddingHorizontal: 12, paddingVertical: 3 },
  chipBig: { flex: 1, justifyContent: 'center', minHeight: 52 },
  chipOn: { backgroundColor: C.tint, borderWidth: 2, borderColor: C.leaf },
  chipText: { fontFamily: F.semi, fontSize: 14, lineHeight: 19, color: C.ink },
  chipSub: { fontSize: 12, color: C.mut, lineHeight: 16 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, borderRadius: R.lg, padding: 12, paddingHorizontal: 14, borderWidth: 1.5, borderColor: C.line },
  optOn: { borderWidth: 2, borderColor: C.leaf, backgroundColor: C.tint },
  oic: { width: 44, height: 44, borderRadius: R.sm, backgroundColor: C.leafTint, alignItems: 'center', justifyContent: 'center' },
  optTitle: { fontFamily: F.bold, fontSize: 16, lineHeight: 21, color: C.leaf },
  optSub: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.mut, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.line },
  radioOn: { borderWidth: 7, borderColor: C.leaf },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontSize: 24, lineHeight: 28, fontFamily: F.semi, color: C.leaf },
  stepOut: { fontFamily: F.display, fontSize: 30, lineHeight: 36, color: C.leaf, minWidth: 46, textAlign: 'center' },
  field: { backgroundColor: C.white, borderRadius: R.sm, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 48, fontFamily: F.body, color: C.ink },
  err: { color: C.danger, fontSize: 13.5, fontFamily: F.semi },
  otp: { height: 62, borderRadius: 14, backgroundColor: C.white, borderWidth: 2, borderColor: C.leaf, alignItems: 'center', justifyContent: 'center' },
  otpActive: { borderColor: C.tur, borderWidth: 3 },
  otpText: { fontFamily: F.display, fontSize: 28, lineHeight: 34, color: C.leaf },
  hiddenInput: { position: 'absolute', opacity: 0.01, width: '100%', height: '100%' },
  note: { backgroundColor: C.leafTint, borderRadius: R.sm, paddingVertical: 10, paddingHorizontal: 12, borderLeftWidth: 4, borderLeftColor: C.leaf },
  noteText: { color: C.leaf, fontSize: 13.5, lineHeight: 19, fontFamily: F.semi },
  strip: { backgroundColor: C.leaf, borderRadius: R.sm, paddingVertical: 10, paddingHorizontal: 12 },
  stripText: { color: C.white, fontSize: 13.5, lineHeight: 19, fontFamily: F.semi },
  card: { backgroundColor: C.white, borderRadius: R.xl, padding: 12, paddingHorizontal: 14, borderWidth: 1.5, borderColor: C.line, gap: 5 },
  tag: { borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 1 },
  tagOk: { backgroundColor: C.leafTint },
  tagRes: { backgroundColor: C.reservedTag },
  tagFq: { backgroundColor: C.tint },
  tagText: { fontSize: 12, lineHeight: 17, fontFamily: F.bold },
  av: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.tur, alignItems: 'center', justifyContent: 'center' },
  avBig: { width: 68, height: 68, borderRadius: 34 },
  avText: { fontFamily: F.display, fontSize: 16, lineHeight: 22, color: C.leaf },
  bar: { height: 10, borderRadius: 5, backgroundColor: C.barTrack, overflow: 'hidden' },
  barLg: { height: 16, borderRadius: 8 },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: C.leaf, borderRadius: 8 },
  barAdd: { position: 'absolute', top: 0, bottom: 0, backgroundColor: C.tur, borderTopRightRadius: 8, borderBottomRightRadius: 8 },
  tlDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.line, backgroundColor: C.white, marginTop: 3 },
  tlDone: { backgroundColor: C.leaf, borderColor: C.leaf },
  tlAct: { backgroundColor: C.tur, borderColor: C.leaf },
  facts: { flexDirection: 'row', gap: 8 },
  fact: { flex: 1, backgroundColor: C.white, borderRadius: R.sm, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1.5, borderColor: C.line },
  factVal: { fontFamily: F.display, fontSize: 19, lineHeight: 25, color: C.leaf },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, borderRadius: R.md, padding: 12, borderWidth: 1.5, borderColor: C.line },
  rowTitle: { fontFamily: F.bold, fontSize: 15, lineHeight: 20, color: C.leaf },
  rowSub: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.mut },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 40, paddingHorizontal: 12 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(16,24,18,0.45)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.rice, borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingTop: 10, paddingHorizontal: 20, gap: 12, elevation: 16,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 30, shadowOffset: { width: 0, height: -10 },
  },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center' },
  sheetH: { fontFamily: F.display, fontSize: 24, lineHeight: 30, color: C.leaf },
});
