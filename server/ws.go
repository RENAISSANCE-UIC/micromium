package server

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	// Only accepts localhost connections; permissive origin check is safe here.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// client is a single connected WebSocket renderer.
type client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

// Hub manages all connected WebSocket clients and broadcasts SelectionDTOs.
type Hub struct {
	clients    map[*client]bool
	broadcast  chan SelectionDTO
	register   chan *client
	unregister chan *client
}

func newHub() *Hub {
	return &Hub{
		clients:    make(map[*client]bool),
		broadcast:  make(chan SelectionDTO, 16),
		register:   make(chan *client),
		unregister: make(chan *client),
	}
}

// Run processes hub events. Must be called in a goroutine.
func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.clients[c] = true
		case c := <-h.unregister:
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
			}
		case sel := <-h.broadcast:
			data, err := json.Marshal(sel)
			if err != nil {
				continue
			}
			for c := range h.clients {
				select {
				case c.send <- data:
				default:
					// Slow client: drop it.
					delete(h.clients, c)
					close(c.send)
				}
			}
		}
	}
}

// ServeWS upgrades an HTTP connection to WebSocket and registers the client.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}
	c := &client{hub: h, conn: conn, send: make(chan []byte, 64)}
	h.register <- c
	go c.writePump()
	c.readPump() // blocks until client disconnects
}

// readPump receives SelectionDTOs from the renderer and re-broadcasts them.
// The source field is preserved so other clients can ignore their own events.
func (c *client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var sel SelectionDTO
		if err := json.Unmarshal(msg, &sel); err != nil {
			log.Printf("ws parse: %v", err)
			continue
		}
		c.hub.broadcast <- sel
	}
}

// writePump drains the send queue to the WebSocket connection.
func (c *client) writePump() {
	defer c.conn.Close()
	for msg := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}
