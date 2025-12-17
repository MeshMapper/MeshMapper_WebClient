# MeshCore GOME WarDriver v1.0.0 🎉

## First Stable Release

We're thrilled to announce the first stable release of **MeshCore GOME WarDriver**! After successful testing by users on both **Android** and **iOS** platforms, this web application is ready to help you map Meshtastic coverage in the Ottawa (YOW) region.

---

## 🚀 What is MeshCore GOME WarDriver?

A browser-based Progressive Web App (PWA) that connects to your Meshtastic device via Bluetooth and automatically sends your GPS location to build coverage maps. Perfect for wardriving with Meshtastic networks!

---

## ✨ Key Features

### 📍 Smart GPS Tracking
- **High-accuracy positioning** with real-time updates
- **Location age indicator** shows freshness of GPS data
- **Accuracy metrics** display precision in meters
- **Continuous watch mode** keeps location data fresh

### 🤖 Automated & Manual Modes
- **Manual Ping**: Send individual location pings on demand
- **Auto Mode**: Continuous pinging at your chosen interval:
  - ⚡ 15 seconds (fast coverage)
  - 🎯 30 seconds (default, balanced)
  - 🐢 60 seconds (power-efficient)

### 📡 Power Configuration
Configure your radio power for accurate coverage mapping:
- N/A (default)
- 0.3w
- 0.6w  
- 1.0w

### 🗺️ Live Coverage Map
- **Embedded interactive map** from MeshMapper
- **Auto-refresh** 5 seconds after each ping
- **Real-time updates** to see your coverage grow
- Shows coverage zones, failed areas, and repeaters

### 📊 Session Tracking
- **Ping history** in a scrollable log
- **Timestamps** for every ping sent
- **Coordinates logged** for your reference

### ⚡ Power Management
- **Wake Lock** keeps screen on during auto mode
- **Bluefy integration** prevents screen dimming on iOS
- Ensures continuous GPS accuracy

---

## 📱 Platform Compatibility

### ✅ Android - Fully Supported
- **Tested successfully** by multiple users
- Works with **Chrome** and Chromium-based browsers
- Native **wake lock** and **high-accuracy GPS**
- **Requirements**: Enable Bluetooth and Location permissions

### ✅ iOS - Fully Supported via Bluefy
- **Tested successfully** by iOS users
- Requires **Bluefy browser** (free on App Store)
- Special screen dim prevention enabled
- **Safari not supported** (Web Bluetooth limitation)

📲 **Get Bluefy**: [Download from App Store](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055)

---

## 🛠️ How to Use

1. **Open the app** in Chrome (Android) or Bluefy (iOS)
2. **Enable Bluetooth & GPS** when prompted
3. **Click "Connect"** and select your Meshtastic device
4. **Wait for GPS fix** (coordinates will appear)
5. **Choose your mode**:
   - Click "Send Ping" for manual pings
   - Click "Start Auto Ping" for continuous operation
6. **Watch the map** update with your coverage!

### ⚠️ Important Notes
- Keep the app **in the foreground**
- Screen must stay **on and unlocked**
- Ensure **#wardriving channel** exists on your device
- Works best with **high-accuracy location** enabled

---

## 🌐 Ottawa (YOW) Region

This version is configured for the Ottawa Mesh network:
- **Coverage data** sent to [yow.meshmapper.net](https://yow.meshmapper.net)
- **Community**: [Ottawa Mesh](https://ottawamesh.ca)
- **Coverage maps**: [View current coverage](https://ottawamesh.ca/deployment/coverage/)

---

## 🔧 Technical Stack

- **Web Bluetooth API** - Device communication
- **Geolocation API** - High-accuracy GPS
- **Wake Lock API** - Power management
- **Leaflet.js** - Interactive maps
- **Tailwind CSS** - Responsive UI
- **PWA** - Progressive Web App capabilities

---

## 📋 Requirements

- ✅ **Meshtastic device** with MeshCore Companion firmware
- ✅ **Chromium browser** (Android) or **Bluefy** (iOS)
- ✅ **Bluetooth** and **Location** permissions
- ✅ **#wardriving channel** configured on device

---

## 🙏 Credits & Acknowledgments

This project builds upon the excellent work of others:

- **Original creator**: [Kyle Reed](https://github.com/kallanreed) ([mesh-map](https://github.com/kallanreed/mesh-map))
- **Modified for YOW**: [MrAlders0n](https://github.com/MrAlders0n)
- **Map embed enhancements**: @CSP-Tom
- **Powered by**: [MeshMapper.net](https://meshmapper.net)
- **Community**: Ottawa Mesh and all beta testers

---

## 📖 Documentation

- **Changelog**: See [CHANGELOG.md](CHANGELOG.md) for detailed changes
- **License**: Public Domain (Unlicense)
- **Repository**: [GitHub](https://github.com/MrAlders0n/MeshCore-GOME-WarDriver)

---

## 🐛 Known Issues

- Safari on iOS does not support Web Bluetooth
- App must remain in foreground for GPS accuracy
- Currently optimized for Ottawa (YOW) region only

---

## 🔮 Future Plans

- Support for additional regions
- Offline mode capabilities  
- Enhanced session statistics
- Export/import ping history
- Desktop browser support improvements

---

## 🤝 Get Involved

Found a bug? Have a feature request? Want to contribute?

- **Issues**: [GitHub Issues](https://github.com/MrAlders0n/MeshCore-GOME-WarDriver/issues)
- **Discussions**: [Ottawa Mesh Community](https://ottawamesh.ca)

---

## 📄 License

This software is released into the **public domain** under the [Unlicense](LICENSE).

---

**Happy Wardriving! 🚗📡**

Build those coverage maps and help grow the Meshtastic network! 🌐
