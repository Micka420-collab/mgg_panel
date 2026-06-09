package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// DaemonClient talks to the MGG daemon control API (Bearer node token).
type DaemonClient struct {
	base   string
	token  string
	client *http.Client
}

func NewDaemonClient(base, token string) *DaemonClient {
	return &DaemonClient{base: base, token: token, client: &http.Client{Timeout: 8 * time.Second}}
}

type statusResp struct {
	State string `json:"state"`
	Stats *struct {
		Players *struct {
			Online int `json:"online"`
			Max    int `json:"max"`
		} `json:"players"`
	} `json:"stats"`
}

// Status returns (state, onlinePlayers). onlinePlayers is -1 if unknown.
func (d *DaemonClient) Status(serverID string) (string, int, error) {
	req, _ := http.NewRequest("GET", fmt.Sprintf("%s/api/servers/%s", d.base, serverID), nil)
	req.Header.Set("Authorization", "Bearer "+d.token)
	res, err := d.client.Do(req)
	if err != nil {
		return "", -1, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return "", -1, fmt.Errorf("daemon status %d", res.StatusCode)
	}
	var s statusResp
	if err := json.NewDecoder(res.Body).Decode(&s); err != nil {
		return "", -1, err
	}
	online := -1
	if s.Stats != nil && s.Stats.Players != nil {
		online = s.Stats.Players.Online
	}
	return s.State, online, nil
}

type routesResp struct {
	Routes []Route `json:"routes"`
}

// Routes fetches the current set of proxied servers from the daemon.
func (d *DaemonClient) Routes() ([]Route, error) {
	req, _ := http.NewRequest("GET", fmt.Sprintf("%s/api/proxy/routes", d.base), nil)
	req.Header.Set("Authorization", "Bearer "+d.token)
	res, err := d.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("daemon routes %d", res.StatusCode)
	}
	var rr routesResp
	if err := json.NewDecoder(res.Body).Decode(&rr); err != nil {
		return nil, err
	}
	return rr.Routes, nil
}

func (d *DaemonClient) Power(serverID, action string) error {
	body, _ := json.Marshal(map[string]string{"action": action})
	req, _ := http.NewRequest("POST", fmt.Sprintf("%s/api/servers/%s/power", d.base, serverID), bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+d.token)
	req.Header.Set("Content-Type", "application/json")
	res, err := d.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return fmt.Errorf("daemon power %d", res.StatusCode)
	}
	return nil
}
