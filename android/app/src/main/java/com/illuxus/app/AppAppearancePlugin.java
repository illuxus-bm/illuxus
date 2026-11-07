package com.illuxus.app;

import androidx.appcompat.app.AppCompatDelegate;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the app's own Appearance choice (Light / Device / Dark) drive the
 * native side too: the window behind the page (which fills the system bars
 * where the web view can't draw under them), and native pickers the page
 * opens (dates, times, selects). Called from NativeBridge.
 */
@CapacitorPlugin(name = "AppAppearance")
public class AppAppearancePlugin extends Plugin {

    @PluginMethod
    public void setMode(PluginCall call) {
        String mode = call.getString("mode", "system");
        final int night;
        if ("dark".equals(mode)) night = AppCompatDelegate.MODE_NIGHT_YES;
        else if ("light".equals(mode)) night = AppCompatDelegate.MODE_NIGHT_NO;
        else night = AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM;
        getBridge().executeOnMainThread(() -> {
            if (AppCompatDelegate.getDefaultNightMode() != night) {
                AppCompatDelegate.setDefaultNightMode(night);
            }
            call.resolve();
        });
    }
}
