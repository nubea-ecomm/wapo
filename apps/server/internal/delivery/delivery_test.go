package delivery

import (
	"net"
	"testing"
	"time"
)

func TestPrivateAndMappedDestinationsDenied(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "::1", "::ffff:127.0.0.1", "10.1.2.3", "169.254.169.254", "100.100.100.200", "fc00::1", "224.0.0.1"} {
		if publicIP(net.ParseIP(ip)) {
			t.Errorf("accepted %s", ip)
		}
	}

	if !publicIP(net.ParseIP("8.8.8.8")) {
		t.Fatal("rejected public address")
	}
}

func TestSignatureUsesRawBytes(t *testing.T) {
	body := []byte(`{ "hello": "world" }`)
	sig := Signature(body, "secret")

	if !Verify(body, "secret", sig) || Verify([]byte(`{"hello":"world"}`), "secret", sig) || Verify(body, "secret", "bad") || Verify(body, "", sig) {
		t.Fatal("signature boundary broken")
	}
}

func TestDeliveryOutcomeRetriesThenFailsAtTheBound(t *testing.T) {
	state, delay := deliveryOutcome(503, 1)
	if state != "pending" || delay != 2*time.Second {
		t.Fatalf("first failure outcome = %s, %s", state, delay)
	}

	state, delay = deliveryOutcome(503, 8)
	if state != "failed" || delay != 256*time.Second {
		t.Fatalf("terminal failure outcome = %s, %s", state, delay)
	}

	state, _ = deliveryOutcome(204, 8)
	if state != "delivered" {
		t.Fatalf("successful retry outcome = %s", state)
	}
}
