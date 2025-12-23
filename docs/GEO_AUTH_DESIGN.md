# Geo-Fenced Community Auth System Design

> Design document for converting the existing `checkCapacity()` endpoint into a full geo-fenced community authentication system.
>
> Created: 2025-12-23

---

## Confirmed Decisions

| Decision | Choice |
|----------|--------|
| **Scale** | ~50 communities max |
| **Admins** | Small trusted group (shared secret auth is fine) |
| **Zone geometry** | Circles (radius from center point) |
| **Zone codes** | IATA where exists, custom 3-char otherwise (e.g., "YOW", "KGS") |
| **Overlapping zones** | Closest center wins |
| **Session TTL** | 30 min sliding window — resets on every ping |
| **Slot display** | Show users zone + availability BEFORE connecting |
| **User-facing zone** | Display as "Ottawa (YOW)" format |

---

## Core Flow

1. **Page load** → Get coarse GPS → `GET /zones/status?lat&lng` → Show zone + slot availability
2. **User connects** → BLE pair → Get fresh high-accuracy GPS → `POST /auth` with coords
3. **Backend validates** → GPS fresh? In zone? Slots available? → Return token + session_id
4. **Wardriving** → Each ping extends `expires_at` by 30 min (sliding TTL)
5. **Disconnect** → Flush queue → `POST /auth` with `reason: "disconnect"` → Release slot

---

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /zones/status?lat&lng` | Public. Pre-connection zone check + slot availability |
| `POST /auth` | Auth requests (connect/refresh/disconnect) |
| `POST /admin/communities` | Create community (admin only) |
| `GET /admin/communities` | List all communities |
| `PATCH /admin/communities/:code` | Update community |
| `DELETE /admin/communities/:code` | Remove community |

---

## Database Schema

### communities

```sql
CREATE TABLE communities (
    id SERIAL PRIMARY KEY,
    code VARCHAR(3) UNIQUE NOT NULL,      -- "YOW", "KGS"
    name VARCHAR(100) NOT NULL,           -- "Ottawa", "Kingston"
    center_lat DECIMAL(9,6) NOT NULL,
    center_lng DECIMAL(9,6) NOT NULL,
    radius_km DECIMAL(5,2) NOT NULL,
    max_slots INT NOT NULL DEFAULT 50,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT valid_coords CHECK (
        center_lat BETWEEN -90 AND 90 AND 
        center_lng BETWEEN -180 AND 180
    )
);
```

### active_sessions

```sql
CREATE TABLE active_sessions (
    id SERIAL PRIMARY KEY,
    session_id UUID UNIQUE NOT NULL,
    token_hash VARCHAR(64) NOT NULL,       -- SHA-256 of token
    public_key VARCHAR(64) NOT NULL,       -- Device identity
    device_name VARCHAR(100),              -- "who" field
    community_code VARCHAR(3) REFERENCES communities(code),
    issued_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,         -- Sliding: NOW + 30min on each ping
    last_activity TIMESTAMP DEFAULT NOW(),
    last_lat DECIMAL(9,6),
    last_lng DECIMAL(9,6),
    
    CONSTRAINT unique_device_session UNIQUE (public_key, community_code)
);

CREATE INDEX idx_sessions_expiry ON active_sessions(expires_at);
CREATE INDEX idx_sessions_community ON active_sessions(community_code);
CREATE INDEX idx_sessions_public_key ON active_sessions(public_key);
```

### audit_log (optional)

```sql
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50),    -- "auth_success", "auth_denied", "session_expired"
    public_key VARCHAR(64),
    community_code VARCHAR(3),
    details JSONB,             -- { reason: "zone_full", coords: {...} }
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Client Changes Needed

1. Add coords to auth payload
2. New `GET /zones/status` call on page load
3. Display zone info in UI ("Ottawa (YOW) — 42/50 slots")
4. Extend `REASON_MESSAGES` for new denial codes
5. Update wardrive ping to trigger TTL extension on backend

---

## Security Considerations

- **GPS freshness**: Reject if timestamp > 30s old
- **GPS accuracy**: Reject if accuracy > 100m
- **Token storage**: Hash with SHA-256 before storing
- **Fail closed**: Deny on any validation error
- **Session cleanup**: Cron job expires sessions where `expires_at < NOW()`

---

## API Contracts

### GET /zones/status Response

```json
// In zone with availability
{
  "in_zone": true,
  "zone": {
    "code": "YOW",
    "name": "Ottawa",
    "slots_available": 42,
    "slots_max": 50
  }
}

// Outside all zones
{
  "in_zone": false,
  "zone": null,
  "nearest": {
    "code": "YOW",
    "name": "Ottawa",
    "distance_km": 12.5,
    "slots_available": 42,
    "slots_max": 50
  }
}
```

### POST /auth Request

```json
{
  "key": "MESHMAPPER_API_KEY",
  "public_key": "device_hex_key",
  "who": "device_name",
  "ver": "v1.3.0",
  "reason": "connect",
  "coords": {
    "lat": 45.4215,
    "lng": -75.6972,
    "accuracy_m": 10,
    "timestamp": 1703332800
  }
}
```

### POST /auth Success Response

```json
{
  "allowed": true,
  "token": "opaque_token",
  "session_id": "uuid",
  "community": {
    "code": "YOW",
    "name": "Ottawa"
  },
  "expires_at": 1703336400,
  "refresh_interval_s": 300
}
```

### POST /auth Denial Response

```json
{
  "allowed": false,
  "reason": "outside_zone",
  "nearest_zone": {
    "code": "YOW",
    "distance_km": 12.5
  }
}
```

---

## Denial Reason Codes

| Code | User Message |
|------|--------------|
| `outside_zone` | "Outside coverage area" |
| `zone_full` | "Community at capacity" |
| `zone_disabled` | "Community temporarily unavailable" |
| `gps_stale` | "GPS data too old - enable location" |
| `gps_inaccurate` | "GPS accuracy too low" |
| `outofdate` | "App out of date, please update" |

---

## User-Facing Zone Display

### Before Connection
```
┌─────────────────────────────────────────────────────────────┐
│  📍 Detecting your location...                              │
│                                                             │
│  ✅ You're in: Ottawa (YOW)                                 │
│     Slots: 8 / 50 available                                 │
│                                                             │
│            [ Connect 🔗 ]                                   │
└─────────────────────────────────────────────────────────────┘
```

### During Connection (status bar)
```
┌─────────────────────────────────────────────────────────────┐
│  🟢 Connected │ 📍 Ottawa (YOW) │ Slot 8/50 │ ⏱️ 00:12:34   │
└─────────────────────────────────────────────────────────────┘
```

---

## Session Lifecycle

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   CONNECT   │────►│   ACTIVE     │────►│ DISCONNECT  │
│             │     │              │     │             │
│ • Get GPS   │     │ • Wardrive   │     │ • Flush     │
│ • Auth req  │     │ • Each ping  │     │ • Release   │
│ • Get token │     │   extends    │     │   slot      │
└─────────────┘     │   TTL +30min │     └─────────────┘
                    └──────────────┘
                           │
                           │ (30 min no activity)
                           ▼
                    ┌──────────────┐
                    │  AUTO-EXPIRE │
                    │  Slot freed  │
                    └──────────────┘
```

---

## Geo Calculation (Haversine)

```php
function isWithinGeofence($lat, $lng, $community) {
    $earthRadius = 6371; // km
    
    $dLat = deg2rad($community['center_lat'] - $lat);
    $dLng = deg2rad($community['center_lng'] - $lng);
    
    $a = sin($dLat/2) * sin($dLat/2) +
         cos(deg2rad($lat)) * cos(deg2rad($community['center_lat'])) *
         sin($dLng/2) * sin($dLng/2);
    
    $c = 2 * atan2(sqrt($a), sqrt(1-$a));
    $distance = $earthRadius * $c;
    
    return $distance <= $community['radius_km'];
}
```

---

## Open Items

- [ ] Admin page UI design (map-based community creation?)
- [ ] Exact GPS accuracy threshold tuning
- [ ] Whether to show public status page of all zones
- [ ] Phase 1 implementation: single hardcoded zone for testing
