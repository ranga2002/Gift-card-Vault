package com.saibh.couponvault;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {

    private WebView webView;
    private static final String DATA_FILE = "coupon_vault_data.json";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.parseColor("#0B1120"));
        window.setNavigationBarColor(Color.parseColor("#0B1120"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0B1120"));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new VaultBridge(this), "AndroidBridge");

        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("if(window.handleAndroidBack && window.handleAndroidBack()) { 'handled'; } else { 'exit'; }", value -> {
                if (value == null || !value.contains("handled")) {
                    runOnUiThread(MainActivity.super::onBackPressed);
                }
            });
        } else {
            super.onBackPressed();
        }
    }

    public class VaultBridge {
        private final Context context;

        public VaultBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public String loadVaultData() {
            try {
                File file = new File(context.getFilesDir(), DATA_FILE);
                if (!file.exists()) {
                    return "";
                }
                FileInputStream fis = new FileInputStream(file);
                InputStreamReader isr = new InputStreamReader(fis, StandardCharsets.UTF_8);
                BufferedReader reader = new BufferedReader(isr);
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
                reader.close();
                return sb.toString().trim();
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean saveVaultData(String jsonData) {
            try {
                File file = new File(context.getFilesDir(), DATA_FILE);
                FileOutputStream fos = new FileOutputStream(file, false);
                fos.write(jsonData.getBytes(StandardCharsets.UTF_8));
                fos.flush();
                fos.close();
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void copyToClipboard(String label, String text) {
            runOnUiThread(() -> {
                try {
                    ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                    ClipData clip = ClipData.newPlainText(label, text);
                    if (clipboard != null) {
                        clipboard.setPrimaryClip(clip);
                        Toast.makeText(context, "Copied to clipboard!", Toast.LENGTH_SHORT).show();
                    }
                } catch (Exception e) {
                    Toast.makeText(context, "Copy failed", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void shareText(String title, String text) {
            runOnUiThread(() -> {
                try {
                    Intent sendIntent = new Intent(Intent.ACTION_SEND);
                    sendIntent.setType("text/plain");
                    sendIntent.putExtra(Intent.EXTRA_SUBJECT, title);
                    sendIntent.putExtra(Intent.EXTRA_TEXT, text);
                    Intent shareIntent = Intent.createChooser(sendIntent, title);
                    context.startActivity(shareIntent);
                } catch (Exception e) {
                    Toast.makeText(context, "Could not open Share menu", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(context, message, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void addGoogleCalendarReminder(String title, String description, long startMillis, long endMillis) {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_INSERT);
                    intent.setData(CalendarContract.Events.CONTENT_URI);
                    intent.putExtra(CalendarContract.Events.TITLE, title);
                    intent.putExtra(CalendarContract.Events.DESCRIPTION, description);
                    intent.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startMillis);
                    intent.putExtra(CalendarContract.Events.HAS_ALARM, 1);
                    intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMillis);
                    intent.putExtra(CalendarContract.Events.AVAILABILITY, CalendarContract.Events.AVAILABILITY_FREE);

                    intent.setPackage("com.google.android.calendar");
                    if (intent.resolveActivity(context.getPackageManager()) != null) {
                        context.startActivity(intent);
                        return;
                    }

                    intent.setPackage(null);
                    if (intent.resolveActivity(context.getPackageManager()) != null) {
                        context.startActivity(intent);
                        return;
                    }

                    String gcalUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE&text="
                            + Uri.encode(title) + "&details=" + Uri.encode(description);
                    Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(gcalUrl));
                    context.startActivity(webIntent);
                } catch (Exception e) {
                    Toast.makeText(context, "Could not open Google Calendar: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void openExternalUrl(String url) {
            runOnUiThread(() -> {
                try {
                    String target = url;
                    if (!target.startsWith("http://") && !target.startsWith("https://")) {
                        target = "https://" + target;
                    }
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(target));
                    context.startActivity(intent);
                } catch (Exception e) {
                    Toast.makeText(context, "Could not open link", Toast.LENGTH_SHORT).show();
                }
            });
        }
    }
}
