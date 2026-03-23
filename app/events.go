// Package app - observer event bus for linking views.
// Views publish and subscribe here. No view knows about any other view.
package app

import "sync"

// Source identifiers — views use these to ignore their own events.
const (
	SourceSeqView      = "seqview"
	SourceCircMap      = "circmap"
	SourceFeatureTable = "featuretable"
)

// SelectionEvent is published whenever the user selects something.
// A bp range selection has FeatureID == "".
// A feature selection has Start/End set to the feature's span.
type SelectionEvent struct {
	Start     int    // 0-indexed bp, -1 = cleared
	End       int    // 0-indexed bp, -1 = cleared
	FeatureID string // empty = raw bp selection
	Source    string // which view published this
}

// Bus is a simple synchronous pub/sub bus for SelectionEvents.
type Bus struct {
	mu       sync.RWMutex
	handlers []func(SelectionEvent)
}

// Subscribe registers a handler to receive all future events.
func (b *Bus) Subscribe(handler func(SelectionEvent)) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers = append(b.handlers, handler)
}

// Publish sends an event to all subscribers synchronously.
func (b *Bus) Publish(e SelectionEvent) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, h := range b.handlers {
		h(e)
	}
}

// Clear publishes a cleared selection from the given source.
func (b *Bus) Clear(source string) {
	b.Publish(SelectionEvent{Start: -1, End: -1, Source: source})
}
