import { createContext } from "react";

/**
 * How many pixels the header's centre slot has for its navigation, from `lg`
 * up, where the nav shares one row with the logo and the actions: the
 * header's width less both sides' chips and the gaps. `null` below `lg` (the
 * nav has a row of its own) and before the first measurement.
 *
 * Set by AppHeaderBar; NavChips (ShellNav) uses it to show every name, only
 * icons, or a scrolling row — whichever fits — at any screen width.
 */
export const HeaderNavRoom = createContext<number | null>(null);
