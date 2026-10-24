package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestApply(t *testing.T) {
	dir := t.TempDir()
	for _, f := range []string{"a.jpg", "a.txt", "b.png", "c.jpg"} {
		os.WriteFile(filepath.Join(dir, f), []byte(f), 0o644)
	}
	os.MkdirAll(filepath.Join(dir, "x"), 0o755)
	os.WriteFile(filepath.Join(dir, "x", "c.jpg"), []byte("existing"), 0o644)

	st := State{Captions: true, Assign: map[string][]string{
		"a.jpg": {"x", "y"}, // multi-folder, with caption
		"b.png": {"y"},
		"c.jpg": {"x"}, // collision: must be skipped, not overwritten
	}}
	rep := apply(dir, &st)

	if rep.Applied != 2 || len(rep.Skipped) != 1 {
		t.Fatalf("report = %+v", rep)
	}
	for _, p := range []string{"x/a.jpg", "x/a.txt", "y/a.jpg", "y/a.txt", "y/b.png", "c.jpg"} {
		if _, err := os.Stat(filepath.Join(dir, p)); err != nil {
			t.Errorf("missing %s", p)
		}
	}
	for _, p := range []string{"a.jpg", "a.txt", "b.png"} {
		if _, err := os.Stat(filepath.Join(dir, p)); err == nil {
			t.Errorf("%s should have moved", p)
		}
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "x", "c.jpg")); string(b) != "existing" {
		t.Error("existing file was overwritten")
	}
	if _, ok := st.Assign["c.jpg"]; !ok || len(st.Assign) != 1 {
		t.Errorf("assign after apply = %v", st.Assign)
	}
}

func TestCleanPath(t *testing.T) {
	for in, want := range map[string]string{
		`/Users/me/no\ vale\ la\ pena/Dataset `: "/Users/me/no vale la pena/Dataset", // Terminal drag
		`'/Users/me/no vale/Dataset'`:           "/Users/me/no vale/Dataset",         // quoted drag
		`"/tmp/a b"`:                            "/tmp/a b",
		"/plain/path\n":                         "/plain/path",
	} {
		if got := cleanPath(in); got != want {
			t.Errorf("cleanPath(%q) = %q, want %q", in, got, want)
		}
	}
}
