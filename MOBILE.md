# MissMeConnection — Mobile App Workflow (Capacitor)

We are using **Capacitor** to bridge our Vite + React web application into native Android and iOS apps. This allows us to maintain a single codebase while deploying to mobile app stores.

---

## 🚀 Native Platform Status
- **Android**: Initialized in `/android`
- **iOS**: Initialized in `/ios`

---

## 🛠️ Developer Workflow

Whenever you make changes to the React code and want to see them in the mobile apps, follow these steps:

### 1. Sync Changes
This command builds the web project and copies the assets into the native folders.
```bash
npm run mobile:sync
```

### 2. Open in Native IDEs
To compile/run the app, you need to open the projects in their respective IDEs.

#### **For Android (Windows/Mac)**
Requires **Android Studio**.
```bash
npm run mobile:open:android
```

#### **For iOS (Mac Only)**
Requires **Xcode**.
```bash
npm run mobile:open:ios
```

---

## 📱 Mobile-Specific Considerations

### **Permissions**
Capacitor handles native permissions (Geolocation, Camera, etc.).
- **Geolocation**: Our app already uses the browser Geolocation API. Capacitor automatically bridges this to native GPS.
- **Android**: Check `android/app/src/main/AndroidManifest.xml` for permissions.
- **iOS**: Check `ios/App/App/Info.plist` for `NSLocationWhenInUseUsageDescription`.

### **Safe Area (Notches)**
The UI might need adjustments for phone notches. 
- Use CSS `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` in `index.css` to ensure elements aren't cut off.

---

## 📦 Production Builds
1.  **Android**: Use Android Studio to generate a signed **AAB** (App Bundle) for the Play Store.
2.  **iOS**: Use Xcode to Archive and Upload to **App Store Connect**.

---
*Last Updated: 2026-02-17 (Phase 10: Capacitor Mobile Launch)*
