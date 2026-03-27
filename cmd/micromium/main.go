package main

import (
	"log"
	"net"
	"net/http"

	frontend "github.com/RENAISSANCE-UIC/micromium/frontend"
	"github.com/RENAISSANCE-UIC/micromium/server"
)

func main() {
	log.Println("Starting Micromium server")

	s := server.New()

	staticFS, err := frontend.FS()
	if err != nil {
		log.Fatal("failed to load embedded frontend:", err)
	}
	s.ServeFS(staticFS)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal("failed to bind port:", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	s.SetPort(port)
	log.Printf("Listening on http://127.0.0.1:%d", port)

	if err := http.Serve(ln, s.Handler()); err != nil {
		log.Fatal(err)
	}
}
