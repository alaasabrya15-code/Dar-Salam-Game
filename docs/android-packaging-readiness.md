# Android packaging

## What the repository currently uses

The project is a Vite + TanStack Start web application with a Three.js game. The native wrapper reuses the existing `DarSalam` game component through a separate client-only Vite entry and bundles the existing `public/` assets. The Vercel/TanStack Start build remains unchanged.

The native wrapper does not add sign-in, a database, or advertising. Its Android activity is locked to landscape; the Android manifest requests only the network permission used by the WebView.

## Build

Requires Node 22+, JDK 21, Android SDK Platform 36, and Android Build Tools 36.0.0. Set `JAVA_HOME` and `ANDROID_HOME` for the installed tools, then run:

```sh
npm run android:apk
npm run android:aab
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. The release AAB is written to `android/app/build/outputs/bundle/release/app-release.aab`; it is unsigned until a release signing key is supplied through a secure release process. The application ID is currently `com.darsalam.game` and should be confirmed as unique before publishing.

The Android project targets SDK 36 with minimum SDK 24. Build success does not replace testing on an emulator or physical device: WebGL rendering, touch controls, app lifecycle/resume, and multiple landscape screen sizes still need device verification.
