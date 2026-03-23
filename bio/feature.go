package bio

import "image/color"

// Direction indicates which strand a feature is on.
type Direction int

const (
	Forward Direction = iota
	Reverse
	NoDirection
)

// FeatureType is the GenBank feature key (CDS, promoter, misc_feature, etc.)
type FeatureType string

const (
	CDS         FeatureType = "CDS"
	Promoter    FeatureType = "promoter"
	MiscFeature FeatureType = "misc_feature"
	PrimerBind  FeatureType = "primer_bind"
	RepOrigin   FeatureType = "rep_origin"
	Gene        FeatureType = "gene"
	TRNA        FeatureType = "tRNA"
	RRNA        FeatureType = "rRNA"
)

// Span is a half-open interval [Start, End) of base-pair positions (0-indexed).
type Span struct {
	Start int
	End   int
}

// Feature is a named, colored annotation over one or more spans of a sequence.
// Multiple spans represent a split/joined feature (e.g. exons).
type Feature struct {
	ID         string
	Label      string
	Type       FeatureType
	Spans      []Span
	Direction  Direction
	FwdColor   color.RGBA
	RevColor   color.RGBA
	Qualifiers map[string]string // /gene, /product, /note, /label, etc.
}

// TotalLength returns the sum of all span lengths.
func (f *Feature) TotalLength() int {
	n := 0
	for _, s := range f.Spans {
		n += s.End - s.Start
	}
	return n
}

// Start returns the leftmost base-pair position across all spans.
func (f *Feature) Start() int {
	if len(f.Spans) == 0 {
		return 0
	}
	min := f.Spans[0].Start
	for _, s := range f.Spans[1:] {
		if s.Start < min {
			min = s.Start
		}
	}
	return min
}

// End returns the rightmost base-pair position across all spans.
func (f *Feature) End() int {
	if len(f.Spans) == 0 {
		return 0
	}
	max := f.Spans[0].End
	for _, s := range f.Spans[1:] {
		if s.End > max {
			max = s.End
		}
	}
	return max
}

// Color returns the display color for the feature given a sequence direction.
func (f *Feature) Color() color.RGBA {
	if f.Direction == Reverse {
		return f.RevColor
	}
	return f.FwdColor
}
