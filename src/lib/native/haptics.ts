import { isNativeApp } from "./platform";

/**
 * A light tap of the Taptic Engine / vibration motor, for selection changes
 * (tabs, segmented controls). Silent outside the app.
 */
export function hapticSelection() {
  if (!isNativeApp()) return;
  void import("@capacitor/haptics")
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
    .catch(() => { /* no haptics on this device */ });
}

/** A firmer tap for a completed action (a scan accepted, a pull-to-refresh). */
export function hapticSuccess() {
  if (!isNativeApp()) return;
  void import("@capacitor/haptics")
    .then(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }))
    .catch(() => { /* no haptics on this device */ });
}
