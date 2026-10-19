package store

import (
	"strings"
	"testing"
)

func TestMigrationFileValidation(t *testing.T) {
	valid := []string{"011_operations.sql", "012_conversation_customers.sql", "012_user_profile.sql", "013_next.sql"}
	if err := validateMigrationFiles(valid); err != nil {
		t.Fatal(err)
	}

	for _, files := range [][]string{{"14_bad.sql"}, {"014_first.sql", "014_second.sql"}} {
		if err := validateMigrationFiles(files); err == nil {
			t.Fatalf("accepted invalid migrations: %s", strings.Join(files, ", "))
		}
	}
}
