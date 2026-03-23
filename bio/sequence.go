// Package bio contains pure domain logic for biological sequences and features.
// It has no UI imports and no dependencies outside the Go standard library.
package bio

// Topology describes whether a DNA molecule is linear or circular.
type Topology int

const (
	Linear   Topology = iota
	Circular
)

// Sequence holds a DNA sequence and its metadata.
type Sequence struct {
	Name     string
	Bases    []byte // always uppercase A/T/G/C/N
	Topology Topology
}

// Length returns the number of base pairs.
func (s *Sequence) Length() int {
	return len(s.Bases)
}

// Subsequence returns bases in [start, end), handling circular wraparound.
func (s *Sequence) Subsequence(start, end int) []byte {
	n := s.Length()
	if n == 0 {
		return nil
	}
	start = ((start % n) + n) % n
	end = ((end % n) + n) % n
	if start < end {
		out := make([]byte, end-start)
		copy(out, s.Bases[start:end])
		return out
	}
	// wraparound
	out := make([]byte, n-start+end)
	copy(out, s.Bases[start:])
	copy(out[n-start:], s.Bases[:end])
	return out
}
