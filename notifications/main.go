package main

import (
	"context"
	"log"
	"net/http"

	"github.com/komunitin/komunitin/notifications/events"
	"github.com/komunitin/komunitin/notifications/notifications"
	"github.com/rs/cors"
)

func main() {
	events.InitService()
	notifications.InitService()

	log.Println("Starting notifier service...")
	go notifications.Notifier(context.Background())

	// Setup CORS.
	handler := cors.New(cors.Options{
		AllowCredentials: true,
		AllowedOrigins: []string{
			"http://localhost:8080",
			"https://localhost:2030",
			"https://demo.komunitin.org",
			"https://komunitin.org",
		},
		AllowedHeaders: []string{"Authorization", "Content-Type"},
		Debug:          true,
	}).Handler(http.DefaultServeMux)

	log.Println("Starting web service...")
	go http.ListenAndServe(":2028", handler)

	log.Println("Press CTRL + C to exit.")

	// Block main thread forever using a blocking read operation
	// on a channel that gets never filled.
	forever := make(chan bool)
	<-forever
}
