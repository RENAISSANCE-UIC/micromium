package server

import (
	"encoding/json"
	"net/http"
	"strconv"
)

func (s *Server) handleDocument(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	doc := s.doc
	s.mu.RUnlock()

	if doc == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, documentToDTO(doc))
}

func (s *Server) handleDocumentOpen(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Path == "" {
		writeError(w, http.StatusBadRequest, "missing path")
		return
	}
	if err := s.LoadFile(body.Path); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	s.mu.RLock()
	doc := s.doc
	s.mu.RUnlock()
	writeJSON(w, documentToDTO(doc))
}

func (s *Server) handleSequence(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	doc := s.doc
	s.mu.RUnlock()

	if doc == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	q := r.URL.Query()
	start, err1 := strconv.Atoi(q.Get("start"))
	end, err2 := strconv.Atoi(q.Get("end"))
	if err1 != nil || err2 != nil || start < 0 || end <= start {
		writeError(w, http.StatusBadRequest, "invalid start/end")
		return
	}

	seqLen := len(doc.Sequence.Bases)
	if start >= seqLen {
		writeJSON(w, struct {
			Bases string `json:"bases"`
		}{})
		return
	}
	if end > seqLen {
		end = seqLen
	}

	writeJSON(w, struct {
		Bases string `json:"bases"`
	}{Bases: string(doc.Sequence.Bases[start:end])})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(ErrorDTO{Error: msg})
}
