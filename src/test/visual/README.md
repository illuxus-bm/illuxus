# Visual regression: header + footer gutter parity

Automated drift is caught by `src/components/layout/__tests__/gutters.test.tsx`.

For richer visual review when changing the chrome:

1. Run the app and open `/` and `/events`.
2. Capture screenshots at **1280 × 800** and **390 × 844**.
3. Confirm the header's logo left edge sits at the same x-coordinate as
   the footer's logo left edge, and the right edge of the right-most
   footer link aligns with the right edge of the user menu in the header.
4. Repeat in dark mode.

If the gutters drift, fix it at the source — `<SiteContainer>` — never by
adding ad-hoc padding to a single surface.