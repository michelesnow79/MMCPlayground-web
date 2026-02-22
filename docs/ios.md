# iOS Build Flow

## Online setup

1. `npm install`
2. `npm run build`
3. `npm run ios:sync`
4. `cd ios/App && pod install`
5. Open `ios/App/App.xcworkspace` in Xcode (or run `npm run ios:open`).

## Offline note

You can build and run from Xcode only when `dist/` already exists from a prior online build.
If `dist/` is missing, you must get online and run `npm install` and `npm run build` first.
