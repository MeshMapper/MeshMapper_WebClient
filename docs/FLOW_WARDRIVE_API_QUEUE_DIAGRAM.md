# MESHMAPPER API QUEUE SYSTEM

```diagram
        ┌─────────────────────────────────┐       ┌─────────────────────────────────┐
        │         TX WARDRIVE             │       │         RX WARDRIVE             │
        └─────────────┬────────---────────┘       └─────────────┬────────---────────┘
                      │                                         │
                      ▼                                         ▼
              ┌─────────────────┐                       ┌─────────────────┐
              │   sendPing()    │                       │  RX Listener    │
              │   (BLE ping)    │                       │  (always on)    │
              └────────┬────────┘                       └────────┬────────┘
                       │                                         │
                       ▼                                         │
              ┌─────────────────┐                                │
              │  Ping sent      │                                │
              │  + GPS coords   │                                │
              └────────┬────────┘                                │
                       │                                         │
                       ▼                                         ▼
              ┌─────────────────┐                       ┌─────────────────┐
              │ queueApiMessage │                       │ queueApiMessage │
              │ (type: "TX")    │                       │ (type:  "RX")   │
              │                 │                       │                 │
              │ • lat/lon       │                       │ • lat/lon       │
              │ • who           │                       │ • who           │
              │ • power         │                       │ • power         │
              │ • heard         │                       │ • heard         │
              │ • session_id    │                       │ • session_id    │
              └────────┬────────┘                       └────────┬────────┘
                       │                                         │
                       │      ┌──────────────────────────────────┘
                       │      │
                       ▼      ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────┐     │
│   │                          API QUEUE (apiQueue. messages)                     │     │
│   │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         ┌──────┐              │     │
│   │  │ TX   │ │ RX   │ │ RX   │ │ TX   │ │ RX   │   ...   │ ??    │  max:  50   │     │
│   │  │ msg1 │ │ msg2 │ │ msg3 │ │ msg4 │ │ msg5 │         │msg50 │              │     │
│   │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘         └──────┘              │     │
│   └─────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                       │
│   QUEUE STATE:                                                                        │
│   • messages: []           ─── Array of pending payloads                              │
│   • flushTimerId: null     ─── 30s periodic timer                                     │
│   • txFlushTimerId: null   ─── 3s TX flush timer                                      │
│   • isProcessing: false    ─── Lock to prevent concurrent flushes                     │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              │                             │                             │
              │         FLUSH TRIGGERS      │                             │
              │                             │                             │
              │  ┌──────────────────────────┴────────────────────────┐    │
              │  │                                                   │    │
              ▼  ▼                                                   ▼    ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│                     │ │                     │ │                     │ │                     │
│   TX PING QUEUED    │ │   30s PERIODIC      │ │   QUEUE SIZE = 50   │ │   disconnect()      │
│                     │ │                     │ │                     │ │                     │
│  ┌───────────────┐  │ │  ┌───────────────┐  │ │  ┌───────────────┐  │ │  ┌───────────────┐  │
│  │ Start/Reset   │  │ │  │ setInterval   │  │ │  │  Immediate    │  │ │  │ Flush before  │  │
│  │ 3s timer      │  │ │  │ (30000ms)     │  │ │  │  flush        │  │ │  │ capacity      │  │
│  └───────────────┘  │ │  └───────────────┘  │ │  └───────────────┘  │ │  │ release       │  │
│                     │ │                     │ │                     │ │  └───────────────┘  │
│  Real-time map      │ │  Catches RX msgs    │ │  Batch limit        │ │                     │
│  updates for your   │ │  when no TX pings   │ │  protection         │ │  Clean shutdown     │
│  ping locations     │ │  happening          │ │                     │ │                     │
│                     │ │                     │ │                     │ │                     │
└──────────┬──────────┘ └──────────┬──────────┘ └──────────┬──────────┘ └──────────┬──────────┘
           │                       │                       │                       │
           └───────────────────────┴───────────────────────┴───────────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────┐
                              │     flushApiQueue()     │
                              │                         │
                              │  1. Check isProcessing  │
                              │  2. Set isProcessing    │
                              │  3. Grab & clear queue  │
                              │  4. POST batch to API   │
                              │  5. Handle response     │
                              │  6. Clear isProcessing  │
                              └────────────┬────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │   MESHMAPPER API        │
                              │                         │
                              │   POST [                │
                              │    {TX, lat, lon... },  │
                              │     {RX, lat, lon...},  │
                              │    {RX, lat, lon...},   │
                              │     ...                 │
                              │   ]                     │
                              │                         │
                              │   Max: 50 per request   │
                              └────────────┬────────────┘
                                           │
                         ┌─────────────────┴─────────────────┐
                         ▼                                   ▼
              ┌─────────────────────┐             ┌─────────────────────┐
              │  allowed:  true     │             │  allowed: false     │
              │                     │             │                     │
              │  ✓ Success          │             │  ✗ Slot Revoked     │
              │  ✓ Continue         │             │  ✗ Stop timers      │
              │                     │             │  ✗ Disconnect       │
              └─────────────────────┘             └─────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   TIMING EXAMPLES                                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘

Example 1: TX triggers fast flush, nearby RX messages ride along
────────────────────────────────────────────────────────────────
  0s        1s        2s        3s        4s
  │         │         │         │         │
  │    RX   │         │         │         │
  │    (heard)        │         │         │
  │         │    TX   │         │         │
  │         │ (ping)  │         │         │
  │         │    │    │         │         │
  │         │    └────┼─────────┼─►FLUSH  │
  │         │         │         │(TX+RX)  │
  └─────────┴─────────┴─────────┴─────────┘
                      3 second delay from TX


Example 2: RX only (no pings) - 30s periodic flush
──────────────────────────────────────────────────
  0s       10s       20s       30s
  │         │         │         │
  RX────────┼─────────┼─────────┼─►FLUSH
  │    RX   │    RX   │         │ (3x RX)
  │         │    RX   │         │
  │         │         │         │
  └─────────┴─────────┴─────────┘
  (listening continuously, no TX pings sent)


Example 3: Busy session - multiple TX pings with RX traffic
───────────────────────────────────────────────────────────
  0s        3s        6s        9s       12s
  │         │         │         │         │
  TX────────┼─►FLUSH  │         │         │
  │    RX   │ (TX+RX) │         │         │
  │         │         TX────────┼─►FLUSH  │
  │         │         │    RX   │ (TX+RX) │
  │         │         │    RX   │         │
  └─────────┴─────────┴─────────┴─────────┘


Example 4: Disconnect flushes everything
────────────────────────────────────────
  0s        1s        2s
  │         │         │
  TX────────┼─────────┤
  │    RX   │    RX   │
  │         │    disconnect()
  │         │         │
  │         │         ▼
  │         │      FLUSH (TX + 2x RX)  ◄── session_id still valid
  │         │         │
  │         │         ▼
  │         │      checkCapacity("disconnect")  ◄── releases slot
  │         │         │
  │         │         ▼
  │         │      BLE cleanup
  └─────────┴─────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                  DISCONNECT SEQUENCE                                    │
└─────────────────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐
  │  disconnect()    │
  │  called          │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐     ┌─────────────────────────────────────┐
  │  Queue empty?    │─NO─►│  flushApiQueue()                    │
  └────────┬─────────┘     │  • session_id still valid ✓         │
           │               │  • POST all pending TX + RX         │
          YES              └──────────────────┬──────────────────┘
           │                                  │
           ◄──────────────────────────────────┘
           │
           ▼
  ┌──────────────────┐
  │ stopFlushTimers()│
  │ • Clear 30s timer│
  │ • Clear TX timer │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ checkCapacity    │
  │ ("disconnect")   │◄─── Releases session_id / slot
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ BLE disconnect   │
  │ State cleanup    │
  │ UI updates       │
  └──────────────────┘
  ```