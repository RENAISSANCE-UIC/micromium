package server

import (
	"fmt"
	"image/color"

	"github.com/weackerm/micromium/app"
	"github.com/weackerm/micromium/bio"
)

// GenomeThreshold is the sequence length above which a document is treated as
// a microbial genome rather than a plasmid. Bases are omitted from the DTO
// for genome-mode documents to avoid multi-MB wire payloads.
const GenomeThreshold = 50_000

// DocumentDTO is the JSON representation of an open document.
type DocumentDTO struct {
	Name     string       `json:"name"`
	Length   int          `json:"length"`
	Topology string       `json:"topology"` // "circular" | "linear"
	Bases    string       `json:"bases"`    // empty when Mode == "genome"
	Mode     string       `json:"mode"`     // "plasmid" | "genome"
	Features []FeatureDTO `json:"features"`
}

// FeatureDTO is the JSON representation of a single feature annotation.
type FeatureDTO struct {
	ID        string    `json:"id"`
	Label     string    `json:"label"`
	Type      string    `json:"type"`
	Spans     []SpanDTO `json:"spans"`
	Direction string    `json:"direction"` // "forward" | "reverse" | "none"
	FwdColor  string    `json:"fwdColor"`  // "#RRGGBB"
	RevColor  string    `json:"revColor"`  // "#RRGGBB"
}

// SpanDTO is a half-open [Start, End) interval, 0-indexed.
type SpanDTO struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

// SelectionDTO is sent and received over the WebSocket connection.
type SelectionDTO struct {
	Start     int    `json:"start"`     // -1 = cleared
	End       int    `json:"end"`
	FeatureID string `json:"featureId"` // "" = raw bp selection
	Source    string `json:"source"`    // "circmap" | "seqview" | "featuretable"
}

// ErrorDTO is the standard error response body.
type ErrorDTO struct {
	Error string `json:"error"`
}

func documentToDTO(doc *app.Document) DocumentDTO {
	features := make([]FeatureDTO, len(doc.Features))
	for i, f := range doc.Features {
		spans := make([]SpanDTO, len(f.Spans))
		for j, s := range f.Spans {
			spans[j] = SpanDTO{Start: s.Start, End: s.End}
		}
		features[i] = FeatureDTO{
			ID:        f.ID,
			Label:     f.Label,
			Type:      string(f.Type),
			Spans:     spans,
			Direction: directionString(f.Direction),
			FwdColor:  hexColor(f.FwdColor),
			RevColor:  hexColor(f.RevColor),
		}
	}
	length := doc.Sequence.Length()
	mode := "plasmid"
	bases := string(doc.Sequence.Bases)
	if length >= GenomeThreshold {
		mode = "genome"
		bases = ""
	}
	return DocumentDTO{
		Name:     doc.Sequence.Name,
		Length:   length,
		Topology: topologyString(doc.Sequence.Topology),
		Bases:    bases,
		Mode:     mode,
		Features: features,
	}
}

func hexColor(c color.RGBA) string {
	return fmt.Sprintf("#%02X%02X%02X", c.R, c.G, c.B)
}

func directionString(d bio.Direction) string {
	switch d {
	case bio.Forward:
		return "forward"
	case bio.Reverse:
		return "reverse"
	default:
		return "none"
	}
}

func topologyString(t bio.Topology) string {
	if t == bio.Circular {
		return "circular"
	}
	return "linear"
}
