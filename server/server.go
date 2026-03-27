package server

import (
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/RENAISSANCE-UIC/micromium/app"
	"github.com/RENAISSANCE-UIC/micromium/bio"
)

// Server holds document state and serves the HTTP + WebSocket API.
type Server struct {
	mu      sync.RWMutex
	doc     *app.Document    // currently active record
	allDocs []*app.Document  // all records from the last opened file, sorted largest-first
	docIdx  int              // index of doc within allDocs
	hub     *Hub
	mux     *http.ServeMux
	port    int // set after binding, injected into index.html
}

// New creates a Server with no document loaded.
func New() *Server {
	s := &Server{
		hub: newHub(),
		mux: http.NewServeMux(),
	}
	go s.hub.Run()

	s.mux.HandleFunc("GET /api/document", s.handleDocument)
	s.mux.HandleFunc("POST /api/document/open", s.handleDocumentOpen)
	s.mux.HandleFunc("POST /api/document/select", s.handleDocumentSelect)
	s.mux.HandleFunc("GET /api/document/sequence", s.handleSequence)
	s.mux.HandleFunc("GET /ws", s.hub.ServeWS)

	// Phase 2 stubs.
	s.mux.HandleFunc("POST /api/document/save", stub)
	s.mux.HandleFunc("POST /api/features", stub)
	s.mux.HandleFunc("PUT /api/features/", stub)
	s.mux.HandleFunc("DELETE /api/features/", stub)

	return s
}

// Handler returns the HTTP handler for the server.
func (s *Server) Handler() http.Handler {
	return s.mux
}

// SetPort stores the bound port so it can be injected into index.html.
func (s *Server) SetPort(port int) {
	s.mu.Lock()
	s.port = port
	s.mu.Unlock()
}

// ServeStatic registers a fallback handler that serves files from dir.
// index.html is served with a <script> injecting window.__MICROMIUM_PORT__,
// so the renderer works in any browser without the Electron preload.
// Must be called after all API routes are registered.
func (s *Server) ServeStatic(dir string) {
	fs := http.FileServer(http.Dir(dir))
	s.mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			data, err := os.ReadFile(filepath.Join(dir, "index.html"))
			if err != nil {
				http.NotFound(w, r)
				return
			}
			s.mu.RLock()
			port := s.port
			s.mu.RUnlock()
			injection := fmt.Sprintf(`<script>window.__MICROMIUM_PORT__=%d</script>`, port)
			html := strings.Replace(string(data), "</head>", injection+"</head>", 1)
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte(html))
			return
		}
		fs.ServeHTTP(w, r)
	})
}

// LoadFile parses a GenBank or FASTA file and stores it as the current document.
// For multi-record GenBank files all records are retained; the largest (chromosome)
// is made the active record.
func (s *Server) LoadFile(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	ext := strings.ToLower(filepath.Ext(path))

	var allDocs []*app.Document

	switch ext {
	case ".fa", ".fasta", ".fna":
		seq, err := bio.ParseFASTA(f)
		if err != nil {
			return err
		}
		allDocs = []*app.Document{{Path: path, Sequence: *seq}}
	default: // .gb, .gbk, .ape
		allDocs, err = parseAllGenBankRecords(f, path)
		if err != nil {
			return err
		}
	}

	s.mu.Lock()
	s.allDocs = allDocs
	s.docIdx = 0
	s.doc = allDocs[0]
	s.mu.Unlock()
	return nil
}

// ServeFS serves frontend assets from an embedded fs.FS (production).
// index.html is served with window.__MICROMIUM_PORT__ injected, same as ServeStatic.
func (s *Server) ServeFS(staticFS fs.FS) {
	s.mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			data, err := fs.ReadFile(staticFS, "index.html")
			if err != nil {
				http.NotFound(w, r)
				return
			}
			s.mu.RLock()
			port := s.port
			s.mu.RUnlock()
			injection := fmt.Sprintf(`<script>window.__MICROMIUM_PORT__=%d</script>`, port)
			html := strings.Replace(string(data), "</head>", injection+"</head>", 1)
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte(html))
			return
		}
		http.FileServer(http.FS(staticFS)).ServeHTTP(w, r)
	})
}

func stub(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not implemented")
}
