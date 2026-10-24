package main

import (
	"bufio"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

//go:embed index.html
var indexHTML []byte

const stateFile = ".sorter.json"

var imageExts = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true, ".bmp": true, ".avif": true}

type State struct {
	Keys        map[string]string   `json:"keys"`   // key -> folder name or absolute path
	Assign      map[string][]string `json:"assign"` // image name -> folders
	Captions    bool                `json:"captions"`
	AutoAdvance bool                `json:"autoAdvance"`
	Index       int                 `json:"index"`
}

type Report struct {
	Applied int      `json:"applied"`
	Skipped []string `json:"skipped"`
}

var (
	mu     sync.Mutex
	curDir string
	images []string
)

func listImages(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() && !strings.HasPrefix(e.Name(), ".") && imageExts[strings.ToLower(filepath.Ext(e.Name()))] {
			out = append(out, e.Name())
		}
	}
	sort.Strings(out)
	return out, nil
}

func loadState(dir string) State {
	st := State{Keys: map[string]string{}, Assign: map[string][]string{}, Captions: true, AutoAdvance: true}
	if b, err := os.ReadFile(filepath.Join(dir, stateFile)); err == nil {
		json.Unmarshal(b, &st)
	}
	if st.Keys == nil {
		st.Keys = map[string]string{}
	}
	if st.Assign == nil {
		st.Assign = map[string][]string{}
	}
	return st
}

func saveState(dir string, st State) error {
	b, _ := json.MarshalIndent(st, "", "  ")
	return os.WriteFile(filepath.Join(dir, stateFile), b, 0o644)
}

func resolve(dir, folder string) string {
	if filepath.IsAbs(folder) {
		return folder
	}
	return filepath.Join(dir, folder)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(dst)
		return err
	}
	return out.Close()
}

func moveFile(src, dst string) error {
	if _, err := os.Stat(dst); err == nil {
		return fmt.Errorf("%s already exists", dst)
	}
	if os.Rename(src, dst) == nil {
		return nil
	}
	// different volume: copy, then remove the source
	if err := copyFile(src, dst); err != nil {
		return err
	}
	return os.Remove(src)
}

// apply copies each image (and caption) to every assigned folder except the
// first, then moves it into the first. An image is skipped entirely if any
// destination already holds a file with the same name, so nothing is overwritten.
func apply(dir string, st *State) Report {
	rep := Report{Skipped: []string{}}
	for img, folders := range st.Assign {
		if len(folders) == 0 {
			delete(st.Assign, img)
			continue
		}
		files := []string{img}
		if st.Captions {
			c := strings.TrimSuffix(img, filepath.Ext(img)) + ".txt"
			if _, err := os.Stat(filepath.Join(dir, c)); err == nil {
				files = append(files, c)
			}
		}
		if err := applyOne(dir, files, folders); err != nil {
			rep.Skipped = append(rep.Skipped, img+": "+err.Error())
			continue
		}
		delete(st.Assign, img)
		rep.Applied++
	}
	sort.Strings(rep.Skipped)
	return rep
}

func applyOne(dir string, files, folders []string) error {
	targets := make([]string, len(folders))
	for i, f := range folders {
		targets[i] = resolve(dir, f)
		if err := os.MkdirAll(targets[i], 0o755); err != nil {
			return err
		}
		for _, name := range files {
			if _, err := os.Stat(filepath.Join(targets[i], name)); err == nil {
				return fmt.Errorf("%s already exists in %s", name, f)
			} else if !errors.Is(err, os.ErrNotExist) {
				return err
			}
		}
	}
	for _, name := range files {
		src := filepath.Join(dir, name)
		for _, t := range targets[1:] {
			if err := copyFile(src, filepath.Join(t, name)); err != nil {
				return err
			}
		}
		if err := moveFile(src, filepath.Join(targets[0], name)); err != nil {
			return err
		}
	}
	return nil
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusBadRequest)
}

func openDir(dir string) (map[string]any, error) {
	dir = filepath.Clean(dir)
	imgs, err := listImages(dir)
	if err != nil {
		return nil, err
	}
	mu.Lock()
	curDir, images = dir, imgs
	mu.Unlock()
	return map[string]any{"dir": dir, "images": imgs, "state": loadState(dir)}, nil
}

// cleanPath undoes what a terminal adds when a folder is dragged into it:
// surrounding quotes, backslash-escaped spaces, a trailing space.
func cleanPath(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 && (s[0] == '\'' || s[0] == '"') && s[len(s)-1] == s[0] {
		return s[1 : len(s)-1]
	}
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+1 < len(s) {
			i++
		}
		b.WriteByte(s[i])
	}
	return b.String()
}

// readFolders lets the user drag a folder into the terminal; the browser
// picks it up by polling /api/start.
func readFolders() {
	fmt.Println("Pick a folder in the browser, or drag one here and press Enter:")
	sc := bufio.NewScanner(os.Stdin)
	for sc.Scan() {
		if strings.TrimSpace(sc.Text()) == "" {
			continue
		}
		mu.Lock()
		open := curDir != ""
		mu.Unlock()
		if open {
			// the page would keep saving the old folder's state into the new one
			fmt.Println("A folder is already open; use Browse in the browser to switch.")
			continue
		}
		res, err := openDir(cleanPath(sc.Text()))
		if err != nil {
			fmt.Println("Error:", err)
			continue
		}
		fmt.Printf("Opened %s (%d images)\n", res["dir"], len(res["images"].([]string)))
	}
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(indexHTML)
	})

	http.HandleFunc("/api/start", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		dir := curDir
		mu.Unlock()
		if dir == "" {
			writeJSON(w, map[string]any{})
			return
		}
		res, err := openDir(dir)
		if err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, res)
	})

	http.HandleFunc("/api/pick", func(w http.ResponseWriter, r *http.Request) {
		// macOS native folder picker
		out, err := exec.Command("osascript", "-e", `POSIX path of (choose folder with prompt "Choose image folder")`).Output()
		if err != nil {
			writeJSON(w, map[string]string{"dir": ""})
			return
		}
		writeJSON(w, map[string]string{"dir": strings.TrimSpace(string(out))})
	})

	http.HandleFunc("/api/open", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Dir string }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			fail(w, err)
			return
		}
		res, err := openDir(req.Dir)
		if err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, res)
	})

	http.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) {
		var st State
		if err := json.NewDecoder(r.Body).Decode(&st); err != nil {
			fail(w, err)
			return
		}
		mu.Lock()
		dir := curDir
		mu.Unlock()
		if dir == "" {
			fail(w, errors.New("no folder open"))
			return
		}
		if err := saveState(dir, st); err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	})

	http.HandleFunc("/api/apply", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		dir := curDir
		mu.Unlock()
		if dir == "" {
			fail(w, errors.New("no folder open"))
			return
		}
		st := loadState(dir)
		rep := apply(dir, &st)
		st.Index = 0
		saveState(dir, st)
		res, err := openDir(dir)
		if err != nil {
			fail(w, err)
			return
		}
		res["report"] = rep
		writeJSON(w, res)
	})

	http.HandleFunc("/img", func(w http.ResponseWriter, r *http.Request) {
		name := filepath.Base(r.URL.Query().Get("name"))
		mu.Lock()
		dir, imgs := curDir, images
		mu.Unlock()
		i := sort.SearchStrings(imgs, name)
		if i == len(imgs) || imgs[i] != name {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(dir, name))
	})

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	url := "http://" + ln.Addr().String()
	fmt.Println("Image Sorter running at", url, "(Ctrl+C to quit)")
	if len(os.Args) > 1 {
		if _, err := openDir(cleanPath(os.Args[1])); err != nil {
			fmt.Println("Error:", err)
		}
	} else {
		go readFolders()
	}
	exec.Command("open", url).Start()
	panic(http.Serve(ln, nil))
}
