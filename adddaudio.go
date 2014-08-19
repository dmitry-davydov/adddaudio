package adddaudio

import (
	"net/http"
	"html/template"
)

type App struct {
	AppId uint
}

func init() {
	templates := template.Must(template.ParseFiles("app.html", "index.html"))

	app := &App{4488821}

	http.HandleFunc("/",
		func(w http.ResponseWriter, r *http.Request) {
			urlQuery := r.URL.Query()
			_, inApp := urlQuery["api_id"]
			
			if inApp {
				templates.ExecuteTemplate(w, "app.html", app)
			} else {
				templates.ExecuteTemplate(w, "index.html", app)
			}
		})
}


