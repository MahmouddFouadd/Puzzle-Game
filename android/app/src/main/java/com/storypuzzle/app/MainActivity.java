package com.storypuzzle.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Largest text zoom we honour from the system "Font size" setting; above this the game layout breaks. */
    private static final int MAX_TEXT_ZOOM = 115;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings settings = getBridge().getWebView().getSettings();
            settings.setTextZoom(Math.min(settings.getTextZoom(), MAX_TEXT_ZOOM));
        }
    }
}
