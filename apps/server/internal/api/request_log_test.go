package api

import "testing"

func TestRequestLogSamplingPreservesErrors(t *testing.T) {
	server := &Server{logEvery: 100}
	logged := 0

	for range 1000 {
		if server.shouldLogRequest(200) {
			logged++
		}
	}

	if logged != 10 {
		t.Fatalf("logged %d successful requests, want 10", logged)
	}

	if !server.shouldLogRequest(500) {
		t.Fatal("error request was sampled out")
	}

	if (&Server{}).shouldLogRequest(200) {
		t.Fatal("disabled success sampling persisted a request")
	}
}
