package bio

import (
	"os"
	"testing"
)

func TestParseEcoli(t *testing.T) {
	f, err := os.Open("../testdata/Ecoli_NIST0056.gbk")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer f.Close()
	seq, features, err := ParseGenBank(f)
	if err != nil {
		t.Fatalf("ParseGenBank: %v", err)
	}

	// Sequence length should be ~4.79 Mbp
	if seq.Length() < 1_000_000 {
		t.Errorf("expected length > 1,000,000, got %d", seq.Length())
	}

	// Should have thousands of features
	if len(features) < 500 {
		t.Errorf("expected > 500 features, got %d", len(features))
	}

	// Check that expected feature types are present
	types := map[string]bool{}
	for _, f := range features {
		types[string(f.Type)] = true
	}
	for _, want := range []string{"CDS", "tRNA", "rRNA"} {
		if !types[want] {
			t.Errorf("expected feature type %q to be present", want)
		}
	}

	t.Logf("parsed %s: length=%d, features=%d, types=%v",
		seq.Name, seq.Length(), len(features), keys(types))
}

func keys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
