// Package frontend exposes the compiled Vite output as an embedded fs.FS.
// The //go:embed directive requires frontend/dist/ to exist at compile time,
// so npm run build must be run before go build.
package frontend

import (
	"embed"
	"io/fs"
)

//go:embed dist
var dist embed.FS

// FS returns an fs.FS rooted at the dist directory.
func FS() (fs.FS, error) {
	return fs.Sub(dist, "dist")
}
