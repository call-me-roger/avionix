// react-native-web's Pressable/Touchable* pass a bare `pointerEvents` prop internally
// (react-native-web/dist/exports/Pressable/index.js → createDOMProps), which logs a
// deprecation warning we cannot avoid from app code. Drop that exact message only.
const RNW_POINTER_EVENTS_WARNING = 'props.pointerEvents is deprecated';
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]): void => {
  const first = args[0];
  if (typeof first === 'string' && first.includes(RNW_POINTER_EVENTS_WARNING)) {
    return;
  }
  originalWarn(...args);
};
