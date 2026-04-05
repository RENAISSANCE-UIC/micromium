// topology.go — Kyte-Doolittle TM topology predictor + HTTP handlers.
//
// Ported from betaversium/backend/topology.go.
// Algorithm: sliding-window mean KD hydrophobicity, window=19, threshold=1.6, minTM=12.
//
// Routes registered in server.go:
//   GET /api/topology?seq=<AA>               → JSON topologyResult
//   GET /api/protter?seq=<AA>&name=<title>   → SVG proxied from Protter (avoids CORS)

package server

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ── Kyte-Doolittle hydrophobicity scale ──────────────────────────────────────

var kdScale = map[byte]float64{
	'A': 1.8, 'R': -4.5, 'N': -3.5, 'D': -3.5,
	'C': 2.5, 'Q': -3.5, 'E': -3.5, 'G': -0.4,
	'H': -3.2, 'I': 4.5, 'L': 3.8, 'K': -3.9,
	'M': 1.9, 'F': 2.8, 'P': -1.6, 'S': -0.8,
	'T': -0.7, 'W': -0.9, 'Y': -1.3, 'V': 4.2,
}

const (
	kdWindow    = 19  // standard sliding-window width
	kdThreshold = 1.6 // mean score above this → candidate TM helix
	kdMinTM     = 12  // minimum residues to call a TM segment
)

// ── Response types ────────────────────────────────────────────────────────────

type topoSegment struct {
	Start int    `json:"start"` // 1-indexed, inclusive
	End   int    `json:"end"`   // 1-indexed, inclusive
	Type  string `json:"type"`  // "TM" | "peri" | "cyto"
}

type topoResult struct {
	Sequence string        `json:"sequence"`
	Segments []topoSegment `json:"segments"`
	Length   int           `json:"length"`
	Profile  []float64     `json:"profile"` // per-residue KD score for sparkline
}

// ── Core prediction ───────────────────────────────────────────────────────────

func hydropathyProfile(seq string) []float64 {
	n, half := len(seq), kdWindow/2
	scores := make([]float64, n)
	for i := 0; i < n; i++ {
		sum, count := 0.0, 0
		for j := i - half; j <= i+half; j++ {
			if j >= 0 && j < n {
				sum += kdScale[seq[j]]
				count++
			}
		}
		scores[i] = sum / float64(count)
	}
	return scores
}

func predictTopology(seq string) topoResult {
	seq = strings.ToUpper(seq)
	n := len(seq)
	profile := hydropathyProfile(seq)

	inTM := make([]bool, n)
	for i, s := range profile {
		if s >= kdThreshold {
			inTM[i] = true
		}
	}

	type span struct{ start, end int }
	var tmSpans []span
	for i := 0; i < n; {
		if inTM[i] {
			j := i
			for j < n && inTM[j] {
				j++
			}
			if j-i >= kdMinTM {
				tmSpans = append(tmSpans, span{i, j - 1})
			}
			i = j
		} else {
			i++
		}
	}

	// Build alternating cyto/peri loops with TM segments interspersed.
	// N-terminus assumed cytoplasmic (positive-inside rule default).
	var segs []topoSegment
	prev := 0
	for k, tm := range tmSpans {
		if tm.start > prev {
			loopType := "cyto"
			if k%2 == 1 {
				loopType = "peri"
			}
			segs = append(segs, topoSegment{prev + 1, tm.start, loopType})
		}
		segs = append(segs, topoSegment{tm.start + 1, tm.end + 1, "TM"})
		prev = tm.end + 1
	}
	if prev < n {
		tailType := "cyto"
		if len(tmSpans)%2 == 1 {
			tailType = "peri"
		}
		segs = append(segs, topoSegment{prev + 1, n, tailType})
	}

	return topoResult{
		Sequence: seq,
		Segments: segs,
		Length:   n,
		Profile:  profile,
	}
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

// handleTopology serves GET /api/topology?seq=<AA>
func (s *Server) handleTopology(w http.ResponseWriter, r *http.Request) {
	seq := r.URL.Query().Get("seq")
	if seq == "" {
		writeError(w, http.StatusBadRequest, "seq parameter required")
		return
	}
	writeJSON(w, predictTopology(seq))
}

const protterBase = "https://wlab.ethz.ch/protter/create"

// handleProtterProxy serves GET /api/protter?seq=<AA>&name=<title>
// Proxies the Protter web service to avoid CORS restrictions in the renderer.
func (s *Server) handleProtterProxy(w http.ResponseWriter, r *http.Request) {
	seq := r.URL.Query().Get("seq")
	name := r.URL.Query().Get("name")
	if seq == "" {
		writeError(w, http.StatusBadRequest, "seq parameter required")
		return
	}

	params := url.Values{
		"seq":     {seq},
		"tm":      {"auto"},
		"nterm":   {"intra"}, // N-terminus cytoplasmic
		"format":  {"svg"},
		"title":   {name},
		"numbers": {""},
	}
	target := protterBase + "?" + params.Encode()

	req, err := http.NewRequest("GET", target, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "build request: "+err.Error())
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, "protter unreachable: "+err.Error())
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "image/svg+xml")
	io.Copy(w, resp.Body) //nolint:errcheck
}
