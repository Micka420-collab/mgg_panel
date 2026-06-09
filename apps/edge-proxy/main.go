package main

import (
	"encoding/json"
	"log"
	"os"
)

// Config for the MGG edge proxy: where to reach the daemon, and the routes
// (public listen → internal backend) it should front with wake-on-join.
type Config struct {
	DaemonURL   string  `json:"daemonUrl"`
	DaemonToken string  `json:"daemonToken"`
	Dynamic     bool    `json:"dynamic"` // poll the daemon for routes instead of using a static list
	Routes      []Route `json:"routes"`
}

func main() {
	path := os.Getenv("CONFIG")
	if path == "" {
		path = "config.json"
	}
	var cfg Config
	if raw, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(raw, &cfg); err != nil {
			log.Fatalf("parse config: %v", err)
		}
	} else if os.Getenv("MGG_DYNAMIC") != "1" {
		log.Fatalf("read config %s: %v", path, err)
	}

	// env overrides
	if v := os.Getenv("DAEMON_URL"); v != "" {
		cfg.DaemonURL = v
	}
	if v := os.Getenv("DAEMON_TOKEN"); v != "" {
		cfg.DaemonToken = v
	}
	if os.Getenv("MGG_DYNAMIC") == "1" {
		cfg.Dynamic = true
	}

	p := &Proxy{daemon: NewDaemonClient(cfg.DaemonURL, cfg.DaemonToken), guard: LoadGuard()}

	if cfg.Dynamic {
		if cfg.DaemonURL == "" || cfg.DaemonToken == "" {
			log.Fatal("dynamic mode requires DAEMON_URL and DAEMON_TOKEN")
		}
		log.Printf("⟁ MGG edge proxy — dynamic, daemon %s", cfg.DaemonURL)
		(&Dynamic{p: p}).run() // blocks
		return
	}

	if len(cfg.Routes) == 0 {
		log.Fatal("no routes configured (set routes[] or enable dynamic mode)")
	}
	log.Printf("⟁ MGG edge proxy — %d static route(s), daemon %s", len(cfg.Routes), cfg.DaemonURL)
	started := 0
	for _, r := range cfg.Routes {
		if _, err := p.startRoute(r); err != nil {
			log.Printf("[edge] start %s failed: %v", r.Listen, err) // one bad route ≠ full outage
			continue
		}
		started++
	}
	if started == 0 {
		log.Fatal("no routes could be started")
	}
	select {} // block forever
}
