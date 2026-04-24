#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const targets = [
    path.join(workspaceRoot, 'plugins', 'cordova-plugin-qrscanner', 'src', 'android', 'qrscanner.gradle'),
    path.join(workspaceRoot, 'platforms', 'android', 'cordova-plugin-qrscanner', 'app-qrscanner.gradle')
];

function patchGradleFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const originalContent = fs.readFileSync(filePath, 'utf8');
    const updatedContent = originalContent.replace(/\bcompile\s+'(com\.[^']+)'/g, "implementation '$1'");

    if (updatedContent !== originalContent) {
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        console.log(`Patched QRScanner Gradle file: ${filePath}`);
    }
}

for (const filePath of targets) {
    patchGradleFile(filePath);
}
