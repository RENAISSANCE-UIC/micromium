// Package bio - GenBank parser and writer.
// Handles .gb and .ape files including ApE custom qualifiers.
package bio

import (
	"bufio"
	"fmt"
	"image/color"
	"io"
	"strconv"
	"strings"
	"unicode"
)

// ParseGenBank parses a GenBank or ApE formatted file.
// Returns the sequence, features, and any parse error.
func ParseGenBank(r io.Reader) (*Sequence, []Feature, error) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	var seq Sequence
	var features []Feature

	const (
		stHeader   = 0
		stFeatures = 1
		stOrigin   = 2
	)
	state := stHeader

	var (
		curFeat        *Feature
		curQualKey     string
		curQualBuf     strings.Builder
		inMultilineVal bool
		locationBuf    string
		featureCount   int
		originBuf      strings.Builder
	)

	flushQualifier := func() {
		if curFeat == nil || curQualKey == "" {
			return
		}
		val := curQualBuf.String()
		curFeat.Qualifiers[curQualKey] = val
		applyApEQualifier(curFeat, curQualKey, val)
		curQualKey = ""
		curQualBuf.Reset()
		inMultilineVal = false
	}

	flushFeature := func() {
		if curFeat == nil {
			return
		}
		flushQualifier()
		setFeatureLabel(curFeat)
		features = append(features, *curFeat)
		curFeat = nil
		locationBuf = ""
	}

	for scanner.Scan() {
		line := scanner.Text()

		switch state {
		case stHeader:
			if strings.HasPrefix(line, "LOCUS") {
				parseLocus(line, &seq)
			} else if strings.HasPrefix(line, "FEATURES") {
				state = stFeatures
			}

		case stFeatures:
			if strings.HasPrefix(line, "ORIGIN") || strings.HasPrefix(line, "//") {
				flushFeature()
				if strings.HasPrefix(line, "ORIGIN") {
					state = stOrigin
				}
				continue
			}
			// Detect raw sequence data appearing without an ORIGIN header.
			// A line that is non-empty and consists entirely of DNA bases is
			// unambiguously sequence, not a feature key or qualifier.
			if isRawSequenceLine(line) {
				flushFeature()
				state = stOrigin
				for _, ch := range line {
					if unicode.IsLetter(ch) {
						originBuf.WriteByte(byte(unicode.ToUpper(ch)))
					}
				}
				continue
			}
			if len(line) < 6 {
				continue
			}

			// Feature key line: col 5 is non-space (0-indexed).
			// Key occupies cols 5-20, location starts at col 21.
			if line[5] != ' ' {
				flushFeature()
				featureCount++
				key := ""
				loc := ""
				if len(line) >= 22 {
					key = strings.TrimSpace(line[5:21])
					loc = strings.TrimSpace(line[21:])
				} else {
					key = strings.TrimSpace(line[5:])
				}
				spans, dir := parseLocation(loc)
				curFeat = &Feature{
					ID:         fmt.Sprintf("f%d", featureCount),
					Type:       FeatureType(key),
					Spans:      spans,
					Direction:  dir,
					FwdColor:   defaultFwdColor(FeatureType(key)),
					RevColor:   defaultRevColor(FeatureType(key)),
					Qualifiers: make(map[string]string),
				}
				locationBuf = loc
			} else if len(line) >= 22 && line[21] == '/' {
				// Qualifier line: /key="value" or /key
				flushQualifier()
				rest := line[22:] // after the /
				eqIdx := strings.Index(rest, "=")
				if eqIdx < 0 {
					curQualKey = rest
					inMultilineVal = false
				} else {
					curQualKey = rest[:eqIdx]
					val := rest[eqIdx+1:]
					curQualBuf.Reset()
					if strings.HasPrefix(val, `"`) {
						val = val[1:]
						if strings.HasSuffix(val, `"`) {
							val = val[:len(val)-1]
							curQualBuf.WriteString(val)
							inMultilineVal = false
						} else {
							curQualBuf.WriteString(val)
							inMultilineVal = true
						}
					} else {
						curQualBuf.WriteString(val)
						inMultilineVal = false
					}
				}
			} else if curFeat != nil && inMultilineVal {
				// Continuation of multi-line quoted qualifier value.
				val := strings.TrimSpace(line)
				if strings.HasSuffix(val, `"`) {
					val = val[:len(val)-1]
					curQualBuf.WriteString(val)
					inMultilineVal = false
				} else {
					curQualBuf.WriteString(val)
				}
			} else if curFeat != nil && !isLocationComplete(locationBuf) {
				// Continuation of a multi-line location expression.
				cont := strings.TrimSpace(line)
				locationBuf += cont
				if isLocationComplete(locationBuf) {
					spans, dir := parseLocation(locationBuf)
					curFeat.Spans = spans
					curFeat.Direction = dir
				}
			}

		case stOrigin:
			if strings.HasPrefix(line, "//") {
				// End of record. Stop here — only the first LOCUS section
				// is used. Subsequent contigs would need coordinate-offset
				// translation which is not yet implemented.
				goto done
			}
			for _, ch := range line {
				if unicode.IsLetter(ch) {
					originBuf.WriteByte(byte(unicode.ToUpper(ch)))
				}
			}
		}
	}

done:
	seq.Bases = []byte(originBuf.String())
	return &seq, features, scanner.Err()
}

func parseLocus(line string, seq *Sequence) {
	fields := strings.Fields(line)
	// LOCUS  name  length  bp  DNA  topology  date
	if len(fields) >= 2 {
		seq.Name = fields[1]
	}
	for _, f := range fields {
		switch strings.ToLower(f) {
		case "circular":
			seq.Topology = Circular
		case "linear":
			seq.Topology = Linear
		}
	}
}

// isLocationComplete returns true if the location string has balanced parentheses.
func isLocationComplete(loc string) bool {
	if loc == "" {
		return false
	}
	depth := 0
	for _, ch := range loc {
		if ch == '(' {
			depth++
		} else if ch == ')' {
			depth--
		}
	}
	return depth == 0
}

// parseLocation parses a GenBank feature location expression.
// Returns 0-indexed, half-open spans and strand direction.
func parseLocation(loc string) ([]Span, Direction) {
	loc = strings.TrimSpace(loc)
	if loc == "" {
		return nil, Forward
	}

	dir := Forward

	if strings.HasPrefix(loc, "complement(") && strings.HasSuffix(loc, ")") {
		dir = Reverse
		inner := loc[len("complement(") : len(loc)-1]
		spans, _ := parseLocation(inner)
		return spans, dir
	}

	if strings.HasPrefix(loc, "join(") && strings.HasSuffix(loc, ")") {
		inner := loc[len("join(") : len(loc)-1]
		parts := splitLocationParts(inner)
		var spans []Span
		for _, p := range parts {
			s, _ := parseLocation(p)
			spans = append(spans, s...)
		}
		return spans, dir
	}

	// Simple range: 123..456  or  <123..>456  or  123^456
	loc = strings.Trim(loc, "<>")
	if idx := strings.Index(loc, ".."); idx >= 0 {
		startStr := strings.Trim(loc[:idx], "<>")
		endStr := strings.Trim(loc[idx+2:], "<>")
		start, _ := strconv.Atoi(startStr)
		end, _ := strconv.Atoi(endStr)
		// GenBank is 1-based closed; convert to 0-based half-open.
		return []Span{{Start: start - 1, End: end}}, dir
	}

	// Single position
	pos, err := strconv.Atoi(strings.Trim(loc, "<>"))
	if err == nil && pos > 0 {
		return []Span{{Start: pos - 1, End: pos}}, dir
	}

	return nil, dir
}

// splitLocationParts splits a comma-separated location list,
// respecting nested parentheses (e.g. join inside complement).
func splitLocationParts(s string) []string {
	var parts []string
	depth := 0
	start := 0
	for i, ch := range s {
		switch ch {
		case '(':
			depth++
		case ')':
			depth--
		case ',':
			if depth == 0 {
				parts = append(parts, s[start:i])
				start = i + 1
			}
		}
	}
	parts = append(parts, s[start:])
	return parts
}

// applyApEQualifier interprets ApE-specific qualifiers and stores them in Feature fields.
func applyApEQualifier(f *Feature, key, val string) {
	switch key {
	case "ApEinfo_fwdcolor":
		if c, ok := parseHexColor(val); ok {
			f.FwdColor = c
		}
	case "ApEinfo_revcolor":
		if c, ok := parseHexColor(val); ok {
			f.RevColor = c
		}
	case "ApEinfo_label":
		if f.Label == "" {
			f.Label = val
		}
	}
}

// parseHexColor parses "#RRGGBB" into color.RGBA.
func parseHexColor(s string) (color.RGBA, bool) {
	s = strings.TrimPrefix(s, "#")
	if len(s) != 6 {
		return color.RGBA{}, false
	}
	n, err := strconv.ParseUint(s, 16, 32)
	if err != nil {
		return color.RGBA{}, false
	}
	return color.RGBA{R: byte(n >> 16), G: byte(n >> 8), B: byte(n), A: 0xFF}, true
}

// setFeatureLabel picks the best label for a feature from its qualifiers.
func setFeatureLabel(f *Feature) {
	if f.Label != "" {
		return
	}
	for _, key := range []string{"ApEinfo_label", "label", "gene", "product", "locus_tag", "note"} {
		if v, ok := f.Qualifiers[key]; ok && v != "" {
			if key == "note" && len(v) > 30 {
				v = v[:30]
			}
			f.Label = v
			return
		}
	}
	f.Label = string(f.Type)
}

// defaultFwdColor returns an ApE-inspired default forward color for a feature type.
func defaultFwdColor(ft FeatureType) color.RGBA {
	switch ft {
	case CDS:
		return color.RGBA{R: 0x99, G: 0xFF, B: 0x99, A: 0xFF}
	case Promoter:
		return color.RGBA{R: 0x99, G: 0xCC, B: 0xFF, A: 0xFF}
	case RepOrigin:
		return color.RGBA{R: 0xFF, G: 0xFF, B: 0x99, A: 0xFF}
	case PrimerBind:
		return color.RGBA{R: 0xFF, G: 0xBB, B: 0xFF, A: 0xFF}
	default:
		return color.RGBA{R: 0xCC, G: 0xCC, B: 0xFF, A: 0xFF}
	}
}

// defaultRevColor returns an ApE-inspired default reverse color for a feature type.
func defaultRevColor(ft FeatureType) color.RGBA {
	switch ft {
	case CDS:
		return color.RGBA{R: 0x00, G: 0xCC, B: 0x00, A: 0xFF}
	case Promoter:
		return color.RGBA{R: 0x00, G: 0x66, B: 0xFF, A: 0xFF}
	case RepOrigin:
		return color.RGBA{R: 0xCC, G: 0xCC, B: 0x00, A: 0xFF}
	case PrimerBind:
		return color.RGBA{R: 0xFF, G: 0x00, B: 0xFF, A: 0xFF}
	default:
		return color.RGBA{R: 0x88, G: 0x88, B: 0xFF, A: 0xFF}
	}
}

// isRawSequenceLine returns true if the line looks like bare DNA sequence data
// (only ATGCN letters, possibly with whitespace/digits) with no qualifier or
// feature-table structure. Used to recover from files that omit the ORIGIN header.
func isRawSequenceLine(line string) bool {
	line = strings.TrimSpace(line)
	if len(line) < 10 {
		return false
	}
	dna := 0
	other := 0
	for _, ch := range line {
		switch ch {
		case 'A', 'T', 'G', 'C', 'N', 'a', 't', 'g', 'c', 'n',
			'R', 'Y', 'S', 'W', 'K', 'M', 'B', 'D', 'H', 'V',
			'r', 'y', 's', 'w', 'k', 'm', 'b', 'd', 'h', 'v':
			dna++
		case ' ', '\t', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9':
			// allowed non-base characters (position numbers / spaces)
		default:
			other++
		}
	}
	// Require at least 10 DNA chars and no non-DNA/non-whitespace/non-digit chars.
	return dna >= 10 && other == 0
}
