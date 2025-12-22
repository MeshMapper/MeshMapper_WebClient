flowchart TD
    subgraph INIT["🔌 ON CONNECT"]
        A[BLE Connection Established] --> B[Start Unified RX Listening<br/>Register LogRxData handler]
        B --> B2[Initialize rxBatchBuffer Map<br/>Empty - ready for tracking]
    end

    subgraph RECEIVE["📻 RECEIVE FROM MESH"]
        C[/"Radio receives packet<br/>from repeater"/] --> D[/"BLE pushes LogRxData event<br/>{lastSnr, lastRssi, raw}"/]
    end

    subgraph UNIFIED["🔀 UNIFIED RX HANDLER"]
        D --> E{Header = 0x15? <br/>GroupText}
        E -->|NO| E_IGNORE[/"🚫 IGNORE"/]
        E -->|YES| F{Payload ≥ 3 bytes?}
        F -->|NO| F_IGNORE[/"🚫 IGNORE"/]
        F -->|YES| G{Session Log<br/>Tracking Active? <br/>10s window after TX}
    end

    subgraph SESSION_LOG["📋 SESSION LOG TRACKING (Echo Detection)"]
        G -->|YES| H[Delegate to Session Log Handler]
        H --> I{Channel hash<br/>matches? }
        I -->|NO| I_PASS[Pass to Passive RX]
        I -->|YES| J[Decrypt message content]
        J --> K{Message matches<br/>our sent ping?}
        K -->|NO| K_PASS[Pass to Passive RX]
        K -->|YES| L{Path length > 0?}
        L -->|NO| L_IGNORE[/"🚫 Direct TX, not echo"/]
        L -->|YES| M["✅ ECHO DETECTED! <br/>Extract FIRST hop repeater ID"]
        M --> N[Track in repeaters Map<br/>Update SNR if better<br/>Update UI chips live]
        N --> O[/"Done - wait for next event"/]
    end

    subgraph PASSIVE["👁️ PASSIVE RX PROCESSING"]
        G -->|NO| P[Passive RX Processing]
        I_PASS --> P
        K_PASS --> P
        P --> Q{Path length > 0? }
        Q -->|NO| Q_IGNORE[/"🚫 Direct TX, skip"/]
        Q -->|YES| R["Extract LAST hop<br/>(direct repeater) e.g., '92'"]
        R --> S{GPS fix<br/>available?}
        S -->|NO| S_SKIP[/"⚠️ Skip entry"/]
        S -->|YES| T["📝 ADD TO RX LOG UI<br/>{repeaterId, snr, lat, lon, timestamp}"]
        T --> U[Update RX Log UI<br/>Summary bar + entry chips]
    end

    subgraph BATCH_TRACK["📦 BATCH TRACKING FOR API"]
        U --> V{Batch exists for<br/>this repeater?}
        
        V -->|NO| W["🆕 CREATE NEW BATCH<br/>{<br/>  firstLocation: {lat, lng}<br/>  firstTimestamp: now()<br/>  samples:  []<br/>  timeoutId: null<br/>}"]
        W --> X["⏰ Set 30s timeout<br/>for this repeater"]
        X --> Y[Store in rxBatchBuffer]
        
        V -->|YES| Z[Get existing batch]
        
        Y --> AA["➕ ADD SAMPLE<br/>{snr, location, timestamp}"]
        Z --> AA
        
        AA --> BB["📏 Calculate distance from<br/>firstLocation to current"]
        BB --> CC{Distance ≥ 25m?}
        CC -->|NO| DD[/"Continue collecting<br/>Wait for next event"/]
    end

    subgraph FLUSH_DIST["🔔 FLUSH:  DISTANCE TRIGGER"]
        CC -->|YES| EE["Distance threshold met! "]
        EE --> FLUSH_START
    end

    subgraph FLUSH_TIME["🔔 FLUSH:  TIMEOUT TRIGGER"]
        TIMEOUT[/"⏰ 30s Timer Expires"/] --> FF["Timeout for repeater"]
        FF --> FLUSH_START
    end

    subgraph FLUSH_END["🔔 FLUSH: SESSION END"]
        DISCONNECT[/"🔌 Disconnect Signal"/] --> GG["Flush ALL batches"]
        GG --> HH["Iterate all repeaters<br/>in rxBatchBuffer"]
        HH --> FLUSH_START
    end

    subgraph FLUSH_PROCESS["📤 FLUSH BATCH PROCESS"]
        FLUSH_START[Get batch from buffer] --> II[Clear timeout if exists]
        II --> JJ["📊 AGGREGATE SAMPLES<br/>━━━━━━━━━━━━━━━━━━━━<br/>snr_avg = mean(samples.snr)<br/>snr_max = max(samples.snr)<br/>snr_min = min(samples.snr)<br/>sample_count = length<br/>duration = end - start"]
        
        JJ --> KK["📦 BUILD API ENTRY<br/>━━━━━━━━━━━━━━━━━━━━<br/>{<br/>  repeater_id: '92'<br/>  location: firstLocation<br/>  snr_avg: 10.25<br/>  snr_max: 12.5<br/>  snr_min: 8.0<br/>  sample_count: 5<br/>  timestamp_start<br/>  timestamp_end<br/>  trigger:  'distance'<br/>}"]
        
        KK --> LL{session_id<br/>available?}
        LL -->|NO| LL_WARN[/"⚠️ Cannot post: <br/>no session_id"/]
        LL -->|YES| MM["Build payload: <br/>{session_id, entries:  [entry]}"]
        
        MM --> NN["📡 QUEUE API POST<br/>━━━━━━━━━━━━━━━━━━━━<br/>🚧 DEBUG:  console.log()<br/>🚀 PROD: POST to API"]
        
        NN --> OO[Remove batch from<br/>rxBatchBuffer]
        LL_WARN --> OO
        OO --> PP[/"Batch cleared for repeater"/]
    end

    subgraph LOOP["🔄 CONTINUOUS LISTENING"]
        O --> WAIT[/"⏳ Wait for next rx_log event"/]
        DD --> WAIT
        PP --> WAIT
        E_IGNORE --> WAIT
        F_IGNORE --> WAIT
        L_IGNORE --> WAIT
        Q_IGNORE --> WAIT
        S_SKIP --> WAIT
        WAIT --> C
    end

    subgraph CLEANUP["🧹 ON DISCONNECT - FULL CLEANUP"]
        DISCONNECT --> DC1[Flush all pending batches]
        DC1 --> DC2[Stop unified RX listening]
        DC2 --> DC3[Clear RX log entries]
        DC3 --> DC4[Clear rxBatchBuffer]
        DC4 --> DC5[Cancel all pending timeouts]
    end

    B2 --> C
    X -.->|"30s later"| TIMEOUT

    style INIT fill:#e3f2fd
    style RECEIVE fill:#fff8e1
    style UNIFIED fill:#f3e5f5
    style SESSION_LOG fill:#e8f5e9
    style PASSIVE fill:#fce4ec
    style BATCH_TRACK fill:#e0f2f1
    style FLUSH_DIST fill:#ffecb3
    style FLUSH_TIME fill:#ffecb3
    style FLUSH_END fill:#ffcdd2
    style FLUSH_PROCESS fill:#e8eaf6
    style LOOP fill:#eceff1
    style CLEANUP fill:#ffebee