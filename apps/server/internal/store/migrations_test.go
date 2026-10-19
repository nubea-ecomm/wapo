package store

import (
	"strings"
	"testing"
)

func TestMigrationFileValidation(t *testing.T) {
	valid := []string{
		"001_initial.sql", "002_management.sql", "003_whatsapp.sql", "004_users.sql",
		"005_deleted.sql", "006_branding.sql", "007_logos.sql", "008_logs.sql",
		"009_permissions.sql", "010_templates.sql", "011_operations.sql",
		"012_conversation_customers.sql", "012_user_profile.sql", "013_next.sql",
	}
	if err := validateMigrationFiles(valid); err != nil {
		t.Fatal(err)
	}

	for _, files := range [][]string{{"14_bad.sql"}, {"001_first.sql", "001_second.sql"}, {"002_missing_initial.sql"}, {"001_first.sql", "003_gap.sql"}} {
		if err := validateMigrationFiles(files); err == nil {
			t.Fatalf("accepted invalid migrations: %s", strings.Join(files, ", "))
		}
	}
}
