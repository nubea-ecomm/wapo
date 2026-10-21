package api

import "time"

// authUser adapts the existing user identity to Authboss without changing IDs or hashes.
type authUser struct {
	Language                         string
	ID, Email, Name, Password        string
	Active, Confirmed                bool
	ConfirmSelector, ConfirmVerifier string
	RecoverSelector, RecoverVerifier string
	RecoverExpiry                    time.Time
}

func (u *authUser) GetPID() string               { return u.Email }
func (u *authUser) PutPID(v string)              { u.Email = v }
func (u *authUser) GetEmail() string             { return u.Email }
func (u *authUser) PutEmail(v string)            { u.Email = v }
func (u *authUser) GetPassword() string          { return u.Password }
func (u *authUser) PutPassword(v string)         { u.Password = v }
func (u *authUser) GetConfirmed() bool           { return u.Confirmed }
func (u *authUser) PutConfirmed(v bool)          { u.Confirmed = v }
func (u *authUser) GetConfirmSelector() string   { return u.ConfirmSelector }
func (u *authUser) PutConfirmSelector(v string)  { u.ConfirmSelector = v }
func (u *authUser) GetConfirmVerifier() string   { return u.ConfirmVerifier }
func (u *authUser) PutConfirmVerifier(v string)  { u.ConfirmVerifier = v }
func (u *authUser) GetRecoverSelector() string   { return u.RecoverSelector }
func (u *authUser) PutRecoverSelector(v string)  { u.RecoverSelector = v }
func (u *authUser) GetRecoverVerifier() string   { return u.RecoverVerifier }
func (u *authUser) PutRecoverVerifier(v string)  { u.RecoverVerifier = v }
func (u *authUser) GetRecoverExpiry() time.Time  { return u.RecoverExpiry }
func (u *authUser) PutRecoverExpiry(v time.Time) { u.RecoverExpiry = v }
func (u *authUser) PutArbitrary(values map[string]string) {
	u.Name = values["name"]
	u.Language = values["language"]

	if u.Language == "" {
		u.Language = "es"
	}
}

func (u *authUser) GetArbitrary() map[string]string { return map[string]string{"name": u.Name} }
