package notifications

// Listens the events stream and send relevant push notifications to users.

import (
	"context"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"reflect"
	"strings"

	firebase "firebase.google.com/go"
	"firebase.google.com/go/messaging"

	"github.com/komunitin/jsonapi"
	"github.com/komunitin/komunitin/notifications/events"
	"github.com/komunitin/komunitin/notifications/i18n"
	"github.com/komunitin/komunitin/notifications/store"
)

const (
	TransferCommitted = "TransferCommitted"
)

// These configuration parameters are set docker-compose.xml file.
var (
	/*accountingUrl = os.Getenv("KOMUNITIN_ACCOUNTING_URL")*/
	socialUrl = os.Getenv("KOMUNITIN_SOCIAL_URL")
	appUrl    = os.Getenv("KOMUNITIN_APP_URL")
)

type Message struct {
	Title string
	Body  string
	Icon  string
	Link  string
}

type MessageBuilder func(i18n.Localizer) Message

// Wait for data in events stream and perform notifications as needed.
func Notifier(ctx context.Context) error {
	// TODO: Better error handling. Need to be studied carefully, but:
	//  - error at reading could be reattempted after X seconds
	//  - erroneous events/notifications could be moved to a seaparate stream

	// TOO: For far greather throughtput we can decouple reading events from
	// sending notifications by reading events ino a channel and then having
	// different goroutines consuming he channel and performing the notifications.

	stream, err := store.NewStream(ctx, events.EventStream)
	if err != nil {
		return err
	}
	// Infinite loop
	for {
		// Blocking call to get next event in stream
		id, value, err := stream.Get(ctx)
		if err != nil {
			// Unexpected error, terminating.
			return err
		}
		err = handleEvent(ctx, value)
		if err != nil {
			// Error handling event. Just print and ignore event.
			log.Printf("Error handling event: %v\n", err)
		}
		// Acknowledge event handled
		stream.Ack(ctx, id)
	}
}

func handleEvent(ctx context.Context, value map[string]interface{}) error {
	event := value["name"]
	switch event {
	case TransferCommitted:
		return handleTransferCommitted(ctx, value)
	default:
		log.Printf("Unkown event type %v\n", event)
	}
	return nil
}

func fixUrl(url string) string {
	url = strings.Replace(url, "/localhost", "/host.docker.internal", 1)
	return url
}
func getResource(ctx context.Context, url string) (*http.Response, error) {
	url = fixUrl(url)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	token, err := getAuthorizationToken(ctx)
	if err != nil {
		return nil, err
	}
	req.Header.Add("Authorization", fmt.Sprintf("Bearer %s", token))
	return http.DefaultClient.Do(req)
}
func handleTransferCommitted(ctx context.Context, value map[string]interface{}) error {
	// Get full transfer object.
	res, err := getResource(ctx, value["transfer"].(string)+"?include=currency")
	if err != nil {
		return err
	}
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("error getting transfer object: %s", res.Status)
	}
	transfer := new(Transfer)
	err = jsonapi.UnmarshalPayload(res.Body, transfer)
	if err != nil {
		return err
	}

	code := value["code"].(string)
	// Get payer and payee accounts.
	payer := transfer.Payer
	payee := transfer.Payee

	// Get the members related to these accounts.
	url := socialUrl + "/" + code + "/members?filter[account]=" + payer.Id + "," + payee.Id
	res, err = getResource(ctx, url)
	if err != nil {
		return err
	}
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("error getting member objects: %s", res.Status)
	}

	members, err := jsonapi.UnmarshalManyPayload(res.Body, reflect.TypeOf((*Member)(nil)))

	if err != nil {
		return err
	}

	payerMember := members[0].(*Member)
	payeeMember := members[1].(*Member)

	iconUrl := appUrl + "/icons/icon-512x512.png"
	transferUrl := appUrl + "/groups/" + code + "/transactions/" + transfer.Id
	amount := formatAmount(transfer.Amount, transfer.Currency)

	err = notifyMember(ctx, payerMember, func(l i18n.Localizer) Message {
		return Message{
			Title: l.Sprintf("newPurchase"),
			Body:  l.Sprintf("newPurchaseText", amount, payeeMember.Name),
			Icon:  iconUrl,
			Link:  transferUrl,
		}
	})

	if err != nil {
		return err
	}

	notifyMember(ctx, payeeMember, func(l i18n.Localizer) Message {
		return Message{
			Title: l.Sprintf("paymentReceived"),
			Body:  l.Sprintf("paymentReceivedText", amount, payerMember.Name),
			Icon:  iconUrl,
			Link:  transferUrl,
		}
	})

	if err != nil {
		return err
	}

	return nil
}

// Format a currency amount for human readability.
func formatAmount(amount int, currency *Currency) string {
	format := fmt.Sprint("%.", currency.Decimals, "f%s") // "%.2f%s"
	return fmt.Sprintf(format, float64(amount)/math.Pow(10, float64(currency.Scale)), currency.Symbol)
}

func getMemberSubscriptions(ctx context.Context, member *Member) ([]Subscription, error) {
	// Get connection to DB.
	store, err := store.NewStore()
	if err != nil {
		return nil, err
	}

	// Get subscriptions for this member.
	res, err := store.GetByIndex(ctx, "subscriptions", reflect.TypeOf((*Subscription)(nil)), "member", member.Id)
	if err != nil {
		return nil, err
	}

	// Just change types from []interface{} to []Subscription.
	subscriptions := make([]Subscription, len(res))
	for i, sub := range res {
		// Convert to *Subscription and dereference.
		subscriptions[i] = *(sub.(*Subscription))
	}
	return subscriptions, nil
}

func notifyMember(ctx context.Context, member *Member, msgBuilder MessageBuilder) error {
	payerSubs, err := getMemberSubscriptions(ctx, member)
	if err != nil {
		return err
	}
	if len(payerSubs) > 0 {
		l := getLocalizationFromSubscription(payerSubs[0])
		msg := msgBuilder(l)
		err = notifyDevices(ctx, msg, payerSubs)
		if err != nil {
			return err
		}
	}
	return nil
}

func getLocalizationFromSubscription(subs Subscription) i18n.Localizer {
	locale := subs.Settings["locale"].(string)
	return i18n.GetLocalizer(locale)
}

func notifyDevices(ctx context.Context, msg Message, subscriptions []Subscription) error {
	// Credentials are implicitly loaded from a JSON file identifyed by the environment
	// variable GOOGLE_APPLICATION_CREDENTIALS.
	app, err := firebase.NewApp(ctx, nil)
	if err != nil {
		return fmt.Errorf("error initializing firebase: %v", err)
	}
	client, err := app.Messaging(ctx)
	if err != nil {
		return fmt.Errorf("error getting firebase messaging client: %v", err)
	}

	// Build array of registration tokens
	tokens := make([]string, len(subscriptions))
	for i, sub := range subscriptions {
		tokens[i] = sub.Token
	}

	// Build firebase message object.
	message := &messaging.MulticastMessage{
		Tokens: tokens,
		Notification: &messaging.Notification{
			Title: msg.Title,
			Body:  msg.Body,
		},
		Webpush: &messaging.WebpushConfig{
			Notification: &messaging.WebpushNotification{
				Icon: msg.Icon,
			},
			FcmOptions: &messaging.WebpushFcmOptions{
				Link: msg.Link,
			},
		},
	}

	// Send the message!
	br, err := client.SendMulticast(ctx, message)
	if err != nil {
		return err
	}
	// TODO: Handle errors by deleting invalid tokens.

	log.Printf("%d messages sent.\n", br.SuccessCount)

	return nil
}
