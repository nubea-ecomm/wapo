package api

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

var templateVariable = regexp.MustCompile(`\{\{([^}]+)\}\}`)

func (s *Server) renderTemplateMessage(ctx context.Context, project string, connection, message store.Object) string {
	payload := object(message, "payload")
	if str(payload, "type") != "template" {
		return ""
	}
	template := object(payload, "template")
	name := str(template, "name")
	language := str(object(template, "language"), "code")
	if name == "" || language == "" {
		return ""
	}
	var raw []byte
	err := s.Store.Pool.QueryRow(ctx, `SELECT data FROM template_states WHERE project_id=$1 AND business_account_id=$2 AND data->>'name'=$3 AND data->>'language'=$4 ORDER BY observed_at DESC LIMIT 1`, project, str(connection, "business_account_id"), name, language).Scan(&raw)
	if err != nil {
		if err != pgx.ErrNoRows {
			return ""
		}
		return ""
	}
	var definition store.Object
	if json.Unmarshal(raw, &definition) != nil {
		return ""
	}
	values := templateParameterValues(template)
	components, _ := definition["components"].([]any)
	parts := []string{}
	for _, item := range components {
		component, _ := item.(map[string]any)
		typeName := strings.ToLower(str(component, "type"))
		text := str(component, "text")
		if text == "" || (typeName != "header" && typeName != "body" && typeName != "footer") {
			continue
		}
		position := 0
		text = templateVariable.ReplaceAllStringFunc(text, func(variable string) string {
			position++
			key := strings.TrimSuffix(strings.TrimPrefix(variable, "{{"), "}}")
			if named := values[typeName+":"+key]; named != "" {
				return named
			}
			if positional := values[fmt.Sprintf("%s:%d", typeName, position)]; positional != "" {
				return positional
			}
			return variable
		})
		parts = append(parts, text)
	}
	return strings.Join(parts, "\n\n")
}

func templateParameterValues(template store.Object) map[string]string {
	result := map[string]string{}
	components, _ := template["components"].([]any)
	for _, item := range components {
		component, _ := item.(map[string]any)
		typeName := strings.ToLower(str(component, "type"))
		parameters, _ := component["parameters"].([]any)
		for index, item := range parameters {
			parameter, _ := item.(map[string]any)
			value := str(parameter, "text")
			if value == "" {
				value = fmt.Sprint(parameter["currency"])
			}
			if value == "" || value == "<nil>" {
				value = fmt.Sprint(parameter["date_time"])
			}
			if value == "<nil>" {
				value = ""
			}
			result[fmt.Sprintf("%s:%d", typeName, index+1)] = value
			if name := str(parameter, "parameter_name"); name != "" {
				result[typeName+":"+name] = value
			}
		}
	}
	return result
}
