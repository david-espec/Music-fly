/** true quando o app roda dentro do APK (Capacitor), e nao no navegador. */
export const isNative = () =>
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
