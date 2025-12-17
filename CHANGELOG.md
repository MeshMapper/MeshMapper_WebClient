# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- **GPS Accuracy**: The app now requests precise GPS coordinates to avoid the issue that was discovered with Chrome on Android. The GPS logic has also been reworked to be more accurate.
- **Embedded Map**: The map is now embedded in the app and will refresh to the current GPS location 3 seconds after the ping is sent, ensuring the coverage zone is updated by then. Thanks @CSP-Tom for making the embed changes required to make this happen.
