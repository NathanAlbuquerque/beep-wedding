#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const targets = [
    path.join(workspaceRoot, 'plugins', 'cordova-plugin-qrscanner', 'src', 'android', 'qrscanner.gradle'),
    path.join(workspaceRoot, 'platforms', 'android', 'cordova-plugin-qrscanner', 'app-qrscanner.gradle'),
    path.join(workspaceRoot, 'plugins', 'phonegap-plugin-barcodescanner', 'src', 'android', 'barcodescanner.gradle'),
    path.join(workspaceRoot, 'platforms', 'android', 'phonegap-plugin-barcodescanner', 'app-barcodescanner.gradle')
];

const splashThemeTargets = [
    path.join(workspaceRoot, 'platforms', 'android', 'app', 'src', 'main', 'res', 'values', 'cdv_themes.xml')
];

const splashColorTargets = [
    path.join(workspaceRoot, 'platforms', 'android', 'app', 'src', 'main', 'res', 'values', 'cdv_colors.xml'),
    path.join(workspaceRoot, 'platforms', 'android', 'app', 'src', 'main', 'res', 'values-night', 'cdv_colors.xml'),
    path.join(workspaceRoot, 'platforms', 'android', 'app', 'src', 'main', 'res', 'values-v34', 'cdv_colors.xml'),
    path.join(workspaceRoot, 'platforms', 'android', 'app', 'src', 'main', 'res', 'values-night-v34', 'cdv_colors.xml')
];

const splashIconTargets = [
    path.join(workspaceRoot, 'platforms', 'android', 'app', 'src', 'main', 'res', 'drawable', 'ic_cdv_splashscreen.xml')
];

function patchGradleFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const originalContent = fs.readFileSync(filePath, 'utf8');
    const updatedContent = originalContent.replace(/\bcompile\s*(\()/g, 'implementation$1')
        .replace(/\bcompile\s+'(com\.[^']+)'/g, "implementation '$1'")
        .replace(/\bcompile\s*\(name:/g, 'implementation(name:');

    if (updatedContent !== originalContent) {
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        console.log(`Patched Android Gradle dependency file: ${filePath}`);
    }
}

function patchSplashThemeFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const originalContent = fs.readFileSync(filePath, 'utf8');
    const updatedContent = originalContent
        .replace(
            /<item name="windowSplashScreenAnimatedIcon">[^<]*<\/item>/g,
            '<item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>'
        )
        .replace(
            /<item name="windowSplashScreenAnimationDuration">[^<]*<\/item>/g,
            '<item name="windowSplashScreenAnimationDuration">0</item>'
        );

    if (updatedContent !== originalContent) {
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        console.log(`Patched Android splash theme file: ${filePath}`);
    }
}

function patchSplashColorFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const originalContent = fs.readFileSync(filePath, 'utf8');
    const updatedContent = originalContent.replace(
        /<color name="cdv_background_color">[^<]*<\/color>/g,
        '<color name="cdv_background_color">#EEF7F1</color>'
    );

    if (updatedContent !== originalContent) {
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        console.log(`Patched Android splash color file: ${filePath}`);
    }
}

function patchSplashIconFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const safeIconContent = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="512dp"
    android:height="512dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
    <path
        android:fillColor="#00000000"
        android:pathData="M0,0h512v512h-512z" />
</vector>
`;

    const originalContent = fs.readFileSync(filePath, 'utf8');
    if (originalContent !== safeIconContent) {
        fs.writeFileSync(filePath, safeIconContent, 'utf8');
        console.log(`Patched Android splash icon file: ${filePath}`);
    }
}

for (const filePath of targets) {
    patchGradleFile(filePath);
}

for (const filePath of splashThemeTargets) {
    patchSplashThemeFile(filePath);
}

for (const filePath of splashColorTargets) {
    patchSplashColorFile(filePath);
}

for (const filePath of splashIconTargets) {
    patchSplashIconFile(filePath);
}
