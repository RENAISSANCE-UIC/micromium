// Package app manages application state. No UI imports.
package app

import "github.com/weackerm/micromium/bio"

// Document is the single source of truth for an open file.
// Both the sequence viewer and circle map are read-only projections of this.
type Document struct {
	Sequence bio.Sequence
	Features []bio.Feature
	Path     string // empty if unsaved
	Modified bool
}

// FeatureByID returns a pointer to the feature with the given ID, or nil.
func (d *Document) FeatureByID(id string) *bio.Feature {
	for i := range d.Features {
		if d.Features[i].ID == id {
			return &d.Features[i]
		}
	}
	return nil
}
