flowchart TD
    subgraph TRIGGER["🎯 TRIGGER"]
        A[/"User Clicks 'Send Ping'<br/>OR Auto Timer Fires"/]
    end

    subgraph VALIDATION["✅ VALIDATION PHASE"]
        B{Cooldown Active? <br/>7s after last ping}
        B -->|YES| B_BLOCK[/"⛔ Block & Show Warning<br/>'Wait Xs before sending'"/]
        B -->|NO| C[📍 Get GPS Position<br/>lat, lon, accuracy]
        C --> D{Within 150km<br/>of Ottawa?}
        D -->|NO| D_SKIP[/"⚠️ Skip Ping<br/>reason:  'outside geofence'"/]
        D -->|YES| E{≥25m from<br/>last ping?}
        E -->|NO| E_SKIP[/"⚠️ Skip Ping<br/>reason: 'too close'"/]
        E -->|YES| F[✅ Validations Passed]
    end

    subgraph BUILD["📦 BUILD PAYLOAD"]
        F --> G["Build Message: <br/>@[MapperBot] LAT, LON [PWR]"]
    end

    subgraph TRANSMIT["📡 TRANSMIT TO MESH"]
        G --> H[Start Repeater Echo Tracking<br/>Initialize rx_log listener]
        H --> I[/"📤 SEND TO MESH<br/>sendChannelTextMessage()<br/>#wardriving channel"/]
        I --> J[Update UI:  'Ping sent' ✓<br/>Start 7s cooldown<br/>Log to Session]
    end

    subgraph RX_WINDOW["👂 RX LISTENING WINDOW (10 seconds)"]
        J --> K[/"UI:  'Listening for heard repeats (Xs)'"/]
        K --> L{rx_log event<br/>received?}
        L -->|YES| M[Validate header 0x15]
        M --> N[Check channel hash match]
        N --> O[Decrypt & verify content]
        O --> P[Extract first hop repeater ID]
        P --> Q[Track SNR, dedupe by repeater<br/>Update UI chips in real-time]
        Q --> L
        L -->|10s elapsed| R[Stop Tracking<br/>Finalize Results]
    end

    subgraph FINALIZE["📊 FINALIZE & POST"]
        R --> S["Format:  '4e(11. 5),b7(-0.75)'"]
        S --> T[Update Session Log Entry<br/>with Heard Repeaters]
        T --> U[/"🕐 Hidden 3s delay"/]
        U --> V[/"📤 POST to MeshMapper API<br/>{key, lat, lon, who, power,<br/>heard_repeats, ver, session_id}"/]
        V --> W[Refresh Coverage Map<br/>if accuracy OK]
    end

    subgraph NEXT["🔄 SCHEDULE NEXT"]
        W --> X{Auto Mode<br/>Active?}
        X -->|YES| Y[Schedule next ping<br/>15/30/60s]
        X -->|NO| Z[Idle]
    end

    A --> B
    B_BLOCK -.-> A
    D_SKIP --> X
    E_SKIP --> X

    style TRIGGER fill:#e1f5fe
    style VALIDATION fill:#fff3e0
    style BUILD fill:#f3e5f5
    style TRANSMIT fill:#e8f5e9
    style RX_WINDOW fill:#fce4ec
    style FINALIZE fill:#e0f2f1
    style NEXT fill:#f5f5f5