// Package bio - FASTA parser and writer.
package bio

import (
	"bufio"
	"fmt"
	"io"
	"strings"
	"unicode"
)

// ParseFASTA parses a FASTA formatted file, returning the first sequence found.
// No feature annotations are possible in plain FASTA.
func ParseFASTA(r io.Reader) (*Sequence, error) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	var seq Sequence
	var buf strings.Builder
	inSeq := false

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, ">") {
			if inSeq {
				break // only parse the first sequence
			}
			header := line[1:]
			fields := strings.Fields(header)
			if len(fields) > 0 {
				seq.Name = fields[0]
			}
			inSeq = true
		} else if inSeq {
			for _, ch := range line {
				if unicode.IsLetter(ch) {
					buf.WriteByte(byte(unicode.ToUpper(ch)))
				}
			}
		}
	}

	seq.Bases = []byte(buf.String())
	return &seq, scanner.Err()
}

// WriteFASTA writes a sequence in FASTA format, 60 bases per line.
func WriteFASTA(w io.Writer, seq *Sequence) error {
	name := seq.Name
	if name == "" {
		name = "sequence"
	}
	if _, err := fmt.Fprintf(w, ">%s\n", name); err != nil {
		return err
	}
	for i := 0; i < len(seq.Bases); i += 60 {
		end := i + 60
		if end > len(seq.Bases) {
			end = len(seq.Bases)
		}
		if _, err := fmt.Fprintf(w, "%s\n", seq.Bases[i:end]); err != nil {
			return err
		}
	}
	return nil
}
