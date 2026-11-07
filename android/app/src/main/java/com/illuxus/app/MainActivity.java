package com.illuxus.app;

import android.content.res.Configuration;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // The phone's font size (Settings → Display → Font size) scales the app's
    // text, as it does in native apps; a web view ignores it by default.
    // Clamped, so the largest accessibility sizes enlarge text without
    // breaking layouts built for phone widths.
    private static final float MIN_TEXT_SCALE = 0.85f;
    private static final float MAX_TEXT_SCALE = 1.5f;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppAppearancePlugin.class);
        super.onCreate(savedInstanceState);
        applySystemTextSize(getResources().getConfiguration());
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applySystemTextSize(newConfig);
    }

    private void applySystemTextSize(Configuration config) {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        float scale = Math.max(MIN_TEXT_SCALE, Math.min(MAX_TEXT_SCALE, config.fontScale));
        WebSettings settings = webView.getSettings();
        settings.setTextZoom(Math.round(scale * 100));
    }
}
