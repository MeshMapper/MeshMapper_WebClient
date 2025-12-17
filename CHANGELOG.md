# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-17

### 🎉 First Stable Release

We're excited to announce the first stable release of MeshCore GOME WarDriver! This web application has been successfully tested by users on both Android and iOS platforms for wardriving with Meshtastic devices in the Ottawa (YOW) region.

### ✨ Features

#### Core Functionality
- **Web Bluetooth Integration**: Seamless connection to MeshCore Companion devices via Web BLE
- **Automated Wardriving**: Send location pings to the `#wardriving` channel to build coverage maps
- **GPS Tracking**: High-accuracy GPS positioning with real-time location updates
- **Session Logging**: Track all pings sent during your wardriving session

#### Ping Modes
- **Manual Mode**: Send individual pings on demand with the "Send Ping" button
- **Auto Mode**: Continuous automated pinging with configurable intervals:
  - 15 seconds
  - 30 seconds (default)
  - 60 seconds

#### Power Configuration
- Configurable radio power settings for accurate coverage mapping:
  - N/A (default)
  - 0.3w
  - 0.6w
  - 1.0w

#### User Interface
- **Live GPS Display**: Real-time GPS coordinates with accuracy metrics
- **Embedded Coverage Map**: Interactive map view powered by MeshMapper that automatically refreshes after each ping
- **Connection Status**: Clear visual feedback for Bluetooth connection and channel status
- **Session Ping Log**: Scrollable history of all pings sent during the current session
- **Responsive Design**: Mobile-optimized interface using Tailwind CSS
- **Dark Theme**: Easy-on-the-eyes dark mode interface

#### GPS Enhancements
- **High Accuracy Mode**: Requests precise GPS coordinates for improved location accuracy
- **Continuous Watch**: GPS watch functionality keeps location data fresh
- **Smart Refresh**: Coverage map automatically updates 5 seconds after each ping
- **Location Age Display**: Shows how recent your GPS fix is
- **Accuracy Indicator**: Displays GPS accuracy in meters

#### Power Management
- **Wake Lock Support**: Keeps the screen on during auto ping mode to maintain GPS accuracy
- **Bluefy Compatibility**: Special handling for Bluefy browser on iOS to prevent screen dimming

### 📱 Platform Support

#### Android
- ✅ **Fully Tested**: Works reliably with Chrome and other Chromium-based browsers
- ✅ **High Accuracy GPS**: Utilizes Android's high-accuracy location services
- ✅ **Wake Lock**: Native wake lock support keeps screen active during auto mode
- ⚠️ **Important**: Requires Location and Bluetooth permissions enabled
- ⚠️ **Note**: Keep the app in the foreground with screen on and unlocked for best results

#### iOS
- ✅ **Fully Tested**: Confirmed working via Bluefy browser
- ✅ **Bluefy Integration**: Special screen dim prevention for Bluefy browser
- ❌ **Safari Not Supported**: Safari does not support Web Bluetooth API
- 📱 **Recommended Browser**: [Bluefy - Web BLE Browser](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055)

### 🗺️ Regional Configuration

This application is specifically configured for the Ottawa (YOW) region:
- Coverage data sent to [MeshMapper YOW](https://yow.meshmapper.net)
- Integrated with [Ottawa Mesh](https://ottawamesh.ca) network
- Embedded map shows YOW coverage zones and repeaters

### 🔧 Technical Details

#### Web Technologies
- Progressive Web App (PWA) ready with manifest
- Web Bluetooth API for device communication
- Geolocation API with high accuracy mode
- Screen Wake Lock API for power management
- Leaflet.js for map visualization

#### Meshtastic Integration
- Connects via MeshCore Companion BLE interface
- Sends location data in MapperBot format: `@[MapperBot]<LAT LON>[ <power> ]`
- Uses encrypted channel communication with wardriving key
- Automatic device time synchronization

### 📋 Requirements

- **Browser**: Chromium-based browser on Android, or Bluefy on iOS
- **Device**: Meshtastic device with MeshCore Companion firmware
- **Permissions**: 
  - Bluetooth access
  - High-accuracy location services
- **Network**: Must have `#wardriving` channel configured on your Meshtastic device

### 🙏 Acknowledgments

- **Original Project**: Forked from [kallanreed/mesh-map](https://github.com/kallanreed/mesh-map)
- **Modified By**: MrAlders0n for Ottawa Mesh integration
- **Map Integration**: @CSP-Tom for embed functionality improvements
- **Community**: Ottawa Mesh community and all beta testers

### 📝 Known Limitations

- Safari browser not supported (Web Bluetooth API limitation)
- App must remain in foreground for reliable operation
- Screen must stay on and unlocked during auto mode
- Regional limitation: Currently optimized for Ottawa (YOW) region only

### 🔗 Resources

- **Coverage Map**: [Ottawa Mesh Coverage](https://ottawamesh.ca/deployment/coverage/)
- **Community**: [Ottawa Mesh](https://ottawamesh.ca)
- **MeshMapper**: [YOW MeshMapper](https://yow.meshmapper.net)

---

## [Unreleased]

### Planned
- Additional region support
- Offline mode capabilities
- Enhanced session statistics
- Export ping history

[1.0.0]: https://github.com/MrAlders0n/MeshCore-GOME-WarDriver/releases/tag/v1.0.0
