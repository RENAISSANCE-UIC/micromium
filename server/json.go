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
const GenomeThreshold = 20_000

// RecordDTO describes one LOCUS record within a multi-record GenBank file.
type RecordDTO struct {
	Index  int    `json:"index"`  // position in the sorted record list
	Name   string `json:"name"`
	Length int    `json:"length"`
	Mode   string `json:"mode"`  // "plasmid" | "genome"
}

// DocumentDTO is the JSON representation of an open document.
type DocumentDTO struct {
	Name        string       `json:"name"`
	Length      int          `json:"length"`
	Topology    string       `json:"topology"`    // "circular" | "linear"
	Bases       string       `json:"bases"`       // empty when Mode == "genome"
	Mode        string       `json:"mode"`        // "plasmid" | "genome"
	Features    []FeatureDTO `json:"features"`
	RecordIndex int          `json:"recordIndex"` // index of this record in Records
	Records     []RecordDTO  `json:"records"`     // all records; len>1 means multi-record file
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

func documentToDTO(doc *app.Document, allDocs []*app.Document, activeIdx int) DocumentDTO {
	// Suppress 'gene' features when CDS annotations are present — gene is
	// redundant with CDS in standard GenBank files and clutters the displays.
	hasCDS := false
	for _, f := range doc.Features {
		if string(f.Type) == "CDS" {
			hasCDS = true
			break
		}
	}

	var features []FeatureDTO
	for _, f := range doc.Features {
		if hasCDS && string(f.Type) == "gene" {
			continue
		}
		spans := make([]SpanDTO, len(f.Spans))
		for j, s := range f.Spans {
			spans[j] = SpanDTO{Start: s.Start, End: s.End}
		}
		features = append(features, FeatureDTO{
			ID:        f.ID,
			Label:     f.Label,
			Type:      string(f.Type),
			Spans:     spans,
			Direction: directionString(f.Direction),
			FwdColor:  hexColor(f.FwdColor),
			RevColor:  hexColor(f.RevColor),
		})
	}
	if features == nil {
		features = []FeatureDTO{}
	}
	length := doc.Sequence.Length()
	mode := "plasmid"
	bases := string(doc.Sequence.Bases)
	if length >= GenomeThreshold {
		mode = "genome"
		bases = ""
	}

	records := make([]RecordDTO, len(allDocs))
	for i, d := range allDocs {
		rLen := d.Sequence.Length()
		rMode := "plasmid"
		if rLen >= GenomeThreshold {
			rMode = "genome"
		}
		records[i] = RecordDTO{
			Index:  i,
			Name:   d.Sequence.Name,
			Length: rLen,
			Mode:   rMode,
		}
	}

	return DocumentDTO{
		Name:        doc.Sequence.Name,
		Length:      length,
		Topology:    topologyString(doc.Sequence.Topology),
		Bases:       bases,
		Mode:        mode,
		Features:    features,
		RecordIndex: activeIdx,
		Records:     records,
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
