package server

import (
	"bufio"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/weackerm/micromium/app"
	"github.com/weackerm/micromium/bio"
)

// parseAllGenBankRecords splits a (potentially multi-record) GenBank file on
// "//" boundaries, parses every LOCUS record with bio.ParseGenBank, and
// returns the results sorted by sequence length descending (chromosome first).
func parseAllGenBankRecords(r io.Reader, path string) ([]*app.Document, error) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	var docs []*app.Document
	var buf strings.Builder

	flush := func() {
		text := buf.String()
		buf.Reset()
		if !strings.Contains(text, "LOCUS") {
			return
		}
		seq, features, err := bio.ParseGenBank(strings.NewReader(text))
		if err != nil || seq == nil {
			return
		}
		docs = append(docs, &app.Document{
			Path:     path,
			Sequence: *seq,
			Features: features,
		})
	}

	for scanner.Scan() {
		line := scanner.Text()
		buf.WriteString(line)
		buf.WriteByte('\n')
		if strings.TrimSpace(line) == "//" {
			flush()
		}
	}
	// Handle files that end without a trailing //
	if buf.Len() > 0 {
		flush()
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if len(docs) == 0 {
		return nil, fmt.Errorf("no valid GenBank records found")
	}

	// Sort largest record first — chromosome is typically the longest molecule.
	sort.Slice(docs, func(i, j int) bool {
		return docs[i].Sequence.Length() > docs[j].Sequence.Length()
	})

	return docs, nil
}
